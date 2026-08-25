import { isAxiosError } from "axios";
import type { LoginResponse, ServerVersionResult } from "./types";

/** Response was HTTP 2xx but is not a working bilirec API. */
export class BackendUnreachableError extends Error {
  constructor(message = "Not a bilirec backend") {
    super(message);
    this.name = "BackendUnreachableError";
  }
}

export function isLoginResponse(data: unknown): data is LoginResponse {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return false;
  }
  const body = data as Record<string, unknown>;
  return typeof body.user === "string" && typeof body.role === "string";
}

export function isServerVersionResult(data: unknown): data is ServerVersionResult {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return false;
  }
  const body = data as Record<string, unknown>;
  return (
    typeof body.current === "string" &&
    typeof body.url === "string" &&
    typeof body.checked === "boolean"
  );
}

export function isRoomIdList(data: unknown): data is number[] {
  return (
    Array.isArray(data) &&
    data.every((id) => typeof id === "number" && Number.isFinite(id))
  );
}

export function isMissingVersionEndpoint(error: unknown): boolean {
  return isAxiosError(error) && error.response?.status === 404;
}

export function getHttpStatus(error: unknown): number | undefined {
  if (isAxiosError(error)) {
    return error.response?.status;
  }
  return undefined;
}
