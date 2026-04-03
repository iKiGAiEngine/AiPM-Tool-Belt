import type { Scope, Attachment } from "./types";

export const LINES_PER_SCHEDULE_PAGE = 15;

export interface AttachmentPage {
  id: string;
  fileName: string;
  callout: string;
  model: string;
  calloutStamp: string;
  pageCount: number;
  startPage: number;
  endPage: number;
}

export interface PageInfo {
  cover: number;
  scheduleStart: number;
  scheduleEnd: number;
  schedulePages: number;
  attachments: AttachmentPage[];
  total: number;
}

export function computePagination(scope: Scope | null): PageInfo {
  if (!scope) {
    return { cover: 1, scheduleStart: 2, scheduleEnd: 2, schedulePages: 1, attachments: [], total: 2 };
  }

  const lineCount = scope.lines ? scope.lines.length : 0;
  const schedulePages = Math.max(1, Math.ceil(lineCount / LINES_PER_SCHEDULE_PAGE));
  const scheduleEnd = 1 + schedulePages;

  let page = scheduleEnd + 1;
  const attachments: AttachmentPage[] = [];

  if (scope.lines) {
    scope.lines.forEach((line) => {
      if (line.attachments) {
        line.attachments.forEach((att: Attachment) => {
          const pgCount = att.pageCount || 1;
          attachments.push({
            id: att.id,
            fileName: att.fileName,
            callout: line.callout,
            model: line.model,
            calloutStamp: att.calloutStamp,
            pageCount: pgCount,
            startPage: page,
            endPage: page + pgCount - 1,
          });
          page += pgCount;
        });
      }
    });
  }

  return {
    cover: 1,
    scheduleStart: 2,
    scheduleEnd,
    schedulePages,
    attachments,
    total: attachments.length > 0 ? page - 1 : scheduleEnd,
  };
}
