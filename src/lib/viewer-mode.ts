export const VIEWER_SERVER_URL = (import.meta.env.SERVER_URL ?? "").trim();
export const VIEWER_USERNAME = (import.meta.env.VIEWER_USERNAME ?? "").trim();
export const VIEWER_PASSWORD = import.meta.env.VIEWER_PASSWORD ?? "";

/** 公開唯讀模式：建置時提供 SERVER_URL 即啟用。 */
export const VIEWER_MODE_ENABLED = VIEWER_SERVER_URL.length > 0;
export const VIEWER_CREDENTIALS_PROVIDED =
  VIEWER_USERNAME.length > 0 && VIEWER_PASSWORD.length > 0;
