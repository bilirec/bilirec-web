import { isAxiosError } from "axios";

export type NetworkStatus = "online" | "offline";

type Listener = (status: NetworkStatus) => void;

let status: NetworkStatus = "online";
const listeners = new Set<Listener>();

function notify() {
  for (const listener of listeners) {
    listener(status);
  }
}

export function isOffline(): boolean {
  return status === "offline";
}

export function getNetworkStatus(): NetworkStatus {
  return status;
}

export function subscribeNetworkStatus(listener: Listener): () => void {
  listeners.add(listener);
  listener(status);
  return () => {
    listeners.delete(listener);
  };
}

export function markOffline(): void {
  if (status === "offline") {
    return;
  }
  status = "offline";
  notify();
}

export function markOnline(): void {
  if (status === "online") {
    return;
  }
  status = "online";
  notify();
}

/** Transport-level failure: no HTTP response (offline, timeout, DNS, etc.). */
export function isNetworkError(error: unknown): boolean {
  return isAxiosError(error) && !error.response;
}

/** Browser offline → mark immediately. Online alone does not mark restored. */
export function bindBrowserNetworkEvents(): () => void {
  const onOffline = () => markOffline();
  window.addEventListener("offline", onOffline);
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    markOffline();
  }
  return () => {
    window.removeEventListener("offline", onOffline);
  };
}
