import { isAxiosError } from "axios";

export type NetworkStatus = "online" | "offline";

type Listener = (status: NetworkStatus) => void;

let status: NetworkStatus = "online";
const listeners = new Set<Listener>();

/** Consecutive transport failures before showing the global offline toast. */
const TRANSPORT_FAILURES_BEFORE_OFFLINE = 2;

let consecutiveTransportFailures = 0;

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
  consecutiveTransportFailures = 0;
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

export function isRequestTimeout(error: unknown): boolean {
  return isAxiosError(error) && error.code === "ECONNABORTED";
}

/** Record a successful API round-trip; clears the transport failure streak. */
export function noteTransportSuccess(): void {
  consecutiveTransportFailures = 0;
}

/**
 * Record a transport-level API failure. Marks offline only after repeated failures
 * so a single timeout does not show the global reconnecting toast.
 */
export function noteTransportFailure(error: unknown): void {
  if (!isNetworkError(error)) {
    return;
  }
  consecutiveTransportFailures += 1;
  if (consecutiveTransportFailures >= TRANSPORT_FAILURES_BEFORE_OFFLINE) {
    markOffline();
  }
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
