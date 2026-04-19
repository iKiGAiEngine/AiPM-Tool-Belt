import { useEffect, useRef } from "react";

// Tracks active engagement time on a page. Active = tab is visible AND user
// has interacted (mouse/keyboard) within IDLE_MS. Buffers segments per
// (estimateId, stage, scope) and flushes them to the server periodically and
// on unmount/page-unload.
//
// Notes on accuracy:
//   • Multiple browser tabs on the same estimate by the same user will
//     double-count active time. Acceptable for a v1 — flagged for future work.
//   • Server-side a hard 30-min cap is applied per segment; the client also
//     closes the open segment when idle (no input for IDLE_MS), so a tab left
//     open overnight does not accumulate.

const IDLE_MS = 2 * 60 * 1000;        // 2 min idle = stop counting
const FLUSH_INTERVAL_MS = 60 * 1000;  // flush buffered segments every 60s
const TICK_MS = 5 * 1000;             // re-evaluate active state every 5s

interface PendingSegment {
  estimateId: number;
  stage: string;
  scope: string | null;
  startedAt: number; // epoch ms
  endedAt: number;
}

interface TrackerOpts {
  estimateId: number | undefined;
  stage: string;
  scope: string | null;
  enabled?: boolean;
}

export function useActivityTracker({ estimateId, stage, scope, enabled = true }: TrackerOpts) {
  const lastActivityRef = useRef<number>(Date.now());
  const segmentStartRef = useRef<number | null>(null);
  const bufferRef = useRef<PendingSegment[]>([]);
  // Single source of truth for the context the OPEN segment belongs to. Updated
  // atomically with segmentStartRef; the close logic always uses these values
  // so a stage/scope/estimate switch can never attribute time to the wrong row.
  const openCtxRef = useRef<{ estimateId: number; stage: string; scope: string | null } | null>(null);

  function isActiveNow(): boolean {
    if (typeof document === "undefined") return false;
    if (document.visibilityState !== "visible") return false;
    return Date.now() - lastActivityRef.current < IDLE_MS;
  }

  function pushSegment(start: number, end: number, ctx: { estimateId: number; stage: string; scope: string | null }) {
    const dur = end - start;
    if (dur < 1000) return;
    bufferRef.current.push({
      estimateId: ctx.estimateId,
      stage: ctx.stage,
      scope: ctx.scope,
      startedAt: start,
      endedAt: end,
    });
  }

  function closeOpenSegment() {
    if (segmentStartRef.current == null || !openCtxRef.current) {
      segmentStartRef.current = null;
      openCtxRef.current = null;
      return;
    }
    pushSegment(segmentStartRef.current, Date.now(), openCtxRef.current);
    segmentStartRef.current = null;
    openCtxRef.current = null;
  }

  function openSegment(eid: number, st: string, sc: string | null) {
    segmentStartRef.current = Date.now();
    openCtxRef.current = { estimateId: eid, stage: st, scope: sc };
  }

  function flush(useBeacon = false) {
    if (!bufferRef.current.length) return;
    const events = bufferRef.current.map(s => ({
      estimateId: s.estimateId,
      stage: s.stage,
      scope: s.scope,
      startedAt: new Date(s.startedAt).toISOString(),
      endedAt: new Date(s.endedAt).toISOString(),
      durationMs: s.endedAt - s.startedAt,
    }));
    bufferRef.current = [];
    const payload = JSON.stringify({ events });
    try {
      if (useBeacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
        const blob = new Blob([payload], { type: "application/json" });
        navigator.sendBeacon("/api/estimate-analytics/events", blob);
      } else {
        fetch("/api/estimate-analytics/events", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: payload,
          keepalive: true,
        }).catch(() => { /* best-effort */ });
      }
    } catch { /* swallow */ }
  }

  // Context-change effect: any time stage/scope/estimateId changes, atomically
  // close the current segment under the OLD context (via openCtxRef) and open
  // a fresh one under the NEW context if active.
  useEffect(() => {
    if (!enabled || !estimateId) return;
    closeOpenSegment();
    if (isActiveNow()) openSegment(estimateId, stage, scope);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, estimateId, stage, scope]);

  // Listener / timer effect: only depends on `enabled` so it isn't torn down
  // and rebuilt every stage/scope change (which would race with the context
  // effect and risk dropping segments).
  useEffect(() => {
    if (!enabled) return;

    const onActivity = () => { lastActivityRef.current = Date.now(); };
    const onVisibility = () => {
      if (document.visibilityState !== "visible") {
        closeOpenSegment();
      } else {
        lastActivityRef.current = Date.now();
        // Reopen using whatever stage/scope the latest render committed via
        // the context effect. We re-derive that from the currently open ctx
        // if any, otherwise from the latest props captured below.
        if (segmentStartRef.current == null && openCtxRef.current) {
          segmentStartRef.current = Date.now();
        }
      }
    };
    const onUnload = () => {
      closeOpenSegment();
      flush(true);
    };

    window.addEventListener("mousemove", onActivity);
    window.addEventListener("keydown", onActivity);
    window.addEventListener("click", onActivity);
    window.addEventListener("scroll", onActivity, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onUnload);
    window.addEventListener("pagehide", onUnload);

    // Idle / wake re-evaluation
    const tick = window.setInterval(() => {
      const active = isActiveNow();
      if (!active && segmentStartRef.current != null && openCtxRef.current) {
        // User went idle. Close at last-activity time + 1s grace, NOT now.
        const closeAt = Math.min(Date.now(), lastActivityRef.current + 1000);
        pushSegment(segmentStartRef.current, closeAt, openCtxRef.current);
        segmentStartRef.current = null;
        // openCtxRef stays so we can resume the same context on next activity.
      } else if (active && segmentStartRef.current == null && openCtxRef.current) {
        segmentStartRef.current = Date.now();
      }
    }, TICK_MS);

    // Periodic flush. Closes the open segment (capturing time accumulated so
    // far) and immediately reopens it under the same context so we don't
    // double-count when the cleanup runs right after a flush tick.
    const flushTimer = window.setInterval(() => {
      if (segmentStartRef.current != null && openCtxRef.current) {
        const ctx = openCtxRef.current;
        pushSegment(segmentStartRef.current, Date.now(), ctx);
        segmentStartRef.current = isActiveNow() ? Date.now() : null;
      }
      flush(false);
    }, FLUSH_INTERVAL_MS);

    return () => {
      window.removeEventListener("mousemove", onActivity);
      window.removeEventListener("keydown", onActivity);
      window.removeEventListener("click", onActivity);
      window.removeEventListener("scroll", onActivity);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onUnload);
      window.removeEventListener("pagehide", onUnload);
      window.clearInterval(tick);
      window.clearInterval(flushTimer);
      closeOpenSegment();
      flush(false);
    };
  }, [enabled]);
}
