/**
 * Centralized upload size limits.
 *
 * The production deployment runs on Replit Autoscale, whose ingress proxy
 * rejects request bodies larger than ~32 MiB with HTTP 413 — regardless of
 * what multer or Express bodyParser allow. Anything above this cap fails
 * BEFORE the request reaches the application, so we standardize the
 * user-facing limit at 30 MB to leave a small margin for multipart overhead.
 *
 * If/when the deployment is moved to a Reserved VM, the cap goes away and
 * this constant can be raised. Keep client and server limits in sync by
 * importing from here.
 */
export const MAX_UPLOAD_MB = 30;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
export const MAX_UPLOAD_LABEL = `${MAX_UPLOAD_MB} MB`;
