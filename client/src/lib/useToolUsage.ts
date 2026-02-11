import { useEffect, useRef } from "react";

export function useToolUsage(toolId: string) {
  const logged = useRef(false);

  useEffect(() => {
    if (logged.current) return;
    logged.current = true;

    fetch("/api/tool-usage/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ toolId }),
    }).catch(() => {});
  }, [toolId]);
}
