export type AnalyticsConsent = "granted" | "denied";

export const ANALYTICS_CONSENT_KEY = "bilirec.analytics.consent";
export const UMAMI_URL = (import.meta.env.UMAMI_URL ?? "").trim();
export const UMAMI_WEBSITE_ID = (import.meta.env.UMAMI_WEBSITE_ID ?? "").trim();
export const ANALYTICS_ENABLED = UMAMI_URL.length > 0 && UMAMI_WEBSITE_ID.length > 0;

const UMAMI_SCRIPT_ID = "bilirec-umami-script";
const LAST_SEND_KEY = "bilirec.analytics.last-send";
const PRESENCE_LEADER_KEY = "bilirec.analytics:v2:presence-leader";
const PRESENCE_TAB_ID_KEY = "bilirec.analytics:v2:presence-tab";
const SCRIPT_LOAD_TIMEOUT_MS = 10000;
const PRESENCE_INTERVAL_MS = 60 * 1000;
const PRESENCE_LEASE_MS = PRESENCE_INTERVAL_MS * 2;
const PRESENCE_MIN_INTERVAL_MS = 1000;

type UmamiSessionData = Record<string, string>;

interface UmamiTracker {
  identify: (data?: UmamiSessionData) => void | Promise<void>;
  track: (
    event?: string | Record<string, unknown>,
    data?: Record<string, string>,
  ) => void | Promise<void>;
}

interface LastSend {
  day: string;
  version: string;
}

interface PresenceLease {
  id: string;
  expiresAt: number;
}

declare global {
  interface Window {
    umami?: UmamiTracker;
  }
}

let loadPromise: Promise<boolean> | null = null;
let loadGeneration = 0;
let analyticsGeneration = 0;
let sendQueue: Promise<void> = Promise.resolve();
let versionReportPromise: Promise<boolean> | null = null;
let serverVersion: string | null = null;
let midnightTimer: number | null = null;
let presenceTimer: number | null = null;
let presenceLifecycleCleanup: (() => void) | null = null;
let identifiedVersion: string | null = null;
let presenceQueued = false;
let lastPresenceAttemptAt = 0;
let presenceFinalSent = false;
const presenceTabId = createPresenceTabId();

function createPresenceTabId(): string {
  try {
    const existing = sessionStorage.getItem(PRESENCE_TAB_ID_KEY);
    if (existing) {
      return existing;
    }
  } catch {
    // sessionStorage may be unavailable.
  }

  let id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      id = crypto.randomUUID();
    }
  } catch {
    // Fall back to the timestamp identifier.
  }

  try {
    sessionStorage.setItem(PRESENCE_TAB_ID_KEY, id);
  } catch {
    // sessionStorage may be unavailable.
  }

  return id;
}

function queueAnalytics(task: () => Promise<boolean>): Promise<boolean> {
  const result = sendQueue.then(task, task);
  sendQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function parseConsent(value: string | null): AnalyticsConsent | null {
  if (!value) {
    return null;
  }

  if (value === "granted" || value === "denied") {
    return value;
  }

  try {
    const parsed: unknown = JSON.parse(value);
    return parsed === "granted" || parsed === "denied" ? parsed : null;
  } catch {
    return null;
  }
}

export function getAnalyticsConsent(): AnalyticsConsent | null {
  try {
    return parseConsent(localStorage.getItem(ANALYTICS_CONSENT_KEY));
  } catch {
    return null;
  }
}

export function setAnalyticsConsent(consent: AnalyticsConsent): void {
  try {
    localStorage.setItem(ANALYTICS_CONSENT_KEY, JSON.stringify(consent));
  } catch (error) {
    console.error("Failed to save analytics consent:", error);
  }
}

function readLocalStorage<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function readLastSend(): LastSend | null {
  const record = readLocalStorage<Record<string, unknown>>(LAST_SEND_KEY);
  if (!record || typeof record.version !== "string") {
    return null;
  }

  if (typeof record.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(record.day)) {
    return { day: record.day, version: record.version };
  }

  if (typeof record.at === "number" && Number.isFinite(record.at)) {
    return { day: localDateKey(new Date(record.at)), version: record.version };
  }

  return null;
}

function reportableVersion(version: string | null | undefined): string | null {
  const next = version?.trim();
  if (!next || next.toLowerCase() === "unknown") {
    return null;
  }
  return next;
}

export function isReportableAnalyticsVersion(
  version: string | null | undefined,
): boolean {
  return reportableVersion(version) !== null;
}

function writeLastSend(version: string): void {
  try {
    const payload: LastSend = { day: localDateKey(), version };
    localStorage.setItem(LAST_SEND_KEY, JSON.stringify(payload));
  } catch (error) {
    console.debug("Failed to persist analytics last-send:", error);
  }
}

function shouldSend(version: string): boolean {
  const last = readLastSend();
  const today = localDateKey();
  if (!last || last.day !== today) {
    return true;
  }

  if (last.version === version) {
    return false;
  }

  return last.version === "unknown";
}

function msUntilNextLocalMidnight(): number {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return Math.max(next.getTime() - now.getTime(), 0);
}

function clearMidnightSend(): void {
  if (midnightTimer !== null) {
    window.clearTimeout(midnightTimer);
    midnightTimer = null;
  }
}

function scheduleMidnightSend(): void {
  clearMidnightSend();
  midnightTimer = window.setTimeout(() => {
    midnightTimer = null;
    void reportVersionHeartbeat();
    scheduleMidnightSend();
  }, msUntilNextLocalMidnight());
}

function canReport(): boolean {
  return (
    ANALYTICS_ENABLED &&
    getAnalyticsConsent() === "granted" &&
    reportableVersion(serverVersion) !== null
  );
}

function canReportVersion(version: string): boolean {
  return canReport() && reportableVersion(serverVersion) === version;
}

function removeUmamiScript(): void {
  document.getElementById(UMAMI_SCRIPT_ID)?.remove();
}

function unloadTracker(): void {
  removeUmamiScript();
  window.umami = undefined;
  loadPromise = null;
  identifiedVersion = null;
}

async function loadUmamiScript(): Promise<boolean> {
  if (window.umami) {
    return true;
  }

  if (loadPromise) {
    return loadPromise;
  }

  const script = document.createElement("script");
  const generation = ++loadGeneration;
  script.id = UMAMI_SCRIPT_ID;
  script.src = UMAMI_URL;
  script.defer = true;
  script.dataset.websiteId = UMAMI_WEBSITE_ID;
  script.dataset.autoTrack = "false";
  script.dataset.excludeSearch = "true";
  script.dataset.excludeHash = "true";

  const promise = new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (loaded: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timeoutId);

      if (generation !== loadGeneration) {
        resolve(false);
        return;
      }

      if (!loaded) {
        console.debug("Analytics script failed to load or timed out");
        script.remove();
        loadPromise = null;
        resolve(false);
        return;
      }

      resolve(Boolean(window.umami));
    };

    const timeoutId = window.setTimeout(() => {
      finish(Boolean(window.umami));
    }, SCRIPT_LOAD_TIMEOUT_MS);

    script.addEventListener("load", () => finish(true), { once: true });
    script.addEventListener("error", () => finish(false), { once: true });
  });

  loadPromise = promise;

  try {
    document.head.appendChild(script);
  } catch (error) {
    console.debug("Failed to insert analytics script:", error);
    loadPromise = null;
    script.remove();
    return false;
  }

  return promise;
}

function readPresenceLease(): PresenceLease | null {
  const record = readLocalStorage<Partial<PresenceLease>>(PRESENCE_LEADER_KEY);
  if (
    !record ||
    typeof record.id !== "string" ||
    typeof record.expiresAt !== "number" ||
    !Number.isFinite(record.expiresAt)
  ) {
    return null;
  }

  return record as PresenceLease;
}

function tryAcquirePresenceLeadership(): boolean {
  const now = Date.now();
  const current = readPresenceLease();

  if (current && current.id !== presenceTabId && current.expiresAt > now) {
    return false;
  }

  try {
    const lease: PresenceLease = {
      id: presenceTabId,
      expiresAt: now + PRESENCE_LEASE_MS,
    };
    localStorage.setItem(PRESENCE_LEADER_KEY, JSON.stringify(lease));
    return readPresenceLease()?.id === presenceTabId;
  } catch {
    // If storage is unavailable, tracking still works with one sender per tab.
    return true;
  }
}

function releasePresenceLeadership(): void {
  try {
    if (readPresenceLease()?.id === presenceTabId) {
      localStorage.removeItem(PRESENCE_LEADER_KEY);
    }
  } catch {
    // Storage may be unavailable or disabled.
  }
}

function reportPresence(force = false): Promise<boolean> {
  if (!canReport() || presenceQueued) {
    return Promise.resolve(false);
  }

  const now = Date.now();
  if (!force && now - lastPresenceAttemptAt < PRESENCE_MIN_INTERVAL_MS) {
    return Promise.resolve(false);
  }

  if (!tryAcquirePresenceLeadership()) {
    console.debug("Analytics presence ping skipped: another tab is the sender");
    return Promise.resolve(false);
  }

  presenceQueued = true;
  lastPresenceAttemptAt = now;
  const generation = analyticsGeneration;

  return queueAnalytics(async () => {
    try {
      const loaded = await loadUmamiScript();
      if (
        generation !== analyticsGeneration ||
        !loaded ||
        !window.umami ||
        !canReport()
      ) {
        return false;
      }

      // No event name means a pageview in the Umami tracker.
      await Promise.resolve(window.umami.track());
      return true;
    } catch (error) {
      console.debug("Analytics presence ping failed:", error);
      return false;
    } finally {
      if (generation === analyticsGeneration) {
        presenceQueued = false;
      }
    }
  });
}

function reportVersionHeartbeat(): Promise<boolean> {
  const version = reportableVersion(serverVersion);
  if (!version || !canReportVersion(version)) {
    return Promise.resolve(false);
  }

  if (versionReportPromise) {
    return versionReportPromise;
  }

  const generation = analyticsGeneration;
  const promise = queueAnalytics(async () => {
    try {
      const loaded = await loadUmamiScript();
      if (
        generation !== analyticsGeneration ||
        !loaded ||
        !window.umami ||
        !canReportVersion(version)
      ) {
        return false;
      }

      if (identifiedVersion !== version) {
        await Promise.resolve(window.umami.identify({ version }));
        if (generation !== analyticsGeneration || !canReportVersion(version)) {
          return false;
        }
        identifiedVersion = version;
      }

      if (!shouldSend(version)) {
        console.debug("Analytics heartbeat skipped: already sent today for this version");
        return true;
      }

      await Promise.resolve(window.umami.track("heartbeat", { version }));
      writeLastSend(version);
      return true;
    } catch (error) {
      console.debug("Analytics heartbeat failed:", error);
      return false;
    }
  });

  versionReportPromise = promise;
  void promise.then(
    () => {
      if (versionReportPromise === promise) {
        versionReportPromise = null;
      }
    },
    () => {
      if (versionReportPromise === promise) {
        versionReportPromise = null;
      }
    },
  );

  return promise;
}

function startPresenceTracking(): boolean {
  const alreadyStarted = presenceTimer !== null;

  if (!alreadyStarted) {
    presenceFinalSent = false;
    presenceTimer = window.setInterval(() => {
      void reportPresence();
    }, PRESENCE_INTERVAL_MS);
  }

  if (presenceLifecycleCleanup !== null) {
    return alreadyStarted;
  }

  const handleLifecycleEnd = () => {
    if (presenceFinalSent) {
      return;
    }

    presenceFinalSent = true;
    void reportPresence(true);
    releasePresenceLeadership();
  };

  const handlePageShow = (event: PageTransitionEvent) => {
    presenceFinalSent = false;
    // Initial load also fires pageshow; only ping when restoring from bfcache.
    if (event.persisted && canReport()) {
      void reportPresence(true);
    }
  };

  const handleResume = () => {
    presenceFinalSent = false;
    if (canReport()) {
      void reportPresence(true);
    }
  };

  window.addEventListener("pagehide", handleLifecycleEnd);
  document.addEventListener("freeze", handleLifecycleEnd as EventListener);
  window.addEventListener("pageshow", handlePageShow);
  document.addEventListener("resume", handleResume);

  presenceLifecycleCleanup = () => {
    window.removeEventListener("pagehide", handleLifecycleEnd);
    document.removeEventListener("freeze", handleLifecycleEnd as EventListener);
    window.removeEventListener("pageshow", handlePageShow);
    document.removeEventListener("resume", handleResume);
  };

  return alreadyStarted;
}

function stopPresenceTracking(): void {
  if (presenceTimer !== null) {
    window.clearInterval(presenceTimer);
    presenceTimer = null;
  }

  presenceLifecycleCleanup?.();
  presenceLifecycleCleanup = null;
  presenceQueued = false;
  presenceFinalSent = false;
  lastPresenceAttemptAt = 0;
  releasePresenceLeadership();
}

export function setAnalyticsServerVersion(version: string | null | undefined): void {
  if (!ANALYTICS_ENABLED) {
    return;
  }

  const next = reportableVersion(version);
  if (!next) {
    return;
  }

  const changed = serverVersion !== next;
  serverVersion = next;
  if (changed || presenceTimer === null) {
    void enableAnalytics();
  }
}

export async function enableAnalytics(): Promise<boolean> {
  try {
    if (!canReport()) {
      return false;
    }

    const alreadyStarted = startPresenceTracking();
    scheduleMidnightSend();

    const heartbeatReported = await reportVersionHeartbeat();
    if (alreadyStarted) {
      return heartbeatReported;
    }

    return (await reportPresence()) || heartbeatReported;
  } catch (error) {
    console.debug("Failed to enable analytics:", error);
    return false;
  }
}

export function disableAnalytics(): void {
  analyticsGeneration += 1;
  loadGeneration += 1;
  versionReportPromise = null;
  serverVersion = null;
  clearMidnightSend();
  stopPresenceTracking();
  unloadTracker();
}
