import type { TFunction } from "i18next";
import { toast } from "sonner";
import { apiClient, parseVersionError } from "@/lib/api";
import { storage } from "@/lib/storage";
import type { ServerVersionResult } from "@/lib/types";

export const VERSION_LAST_CHECK_KEY = "bilirec-version-last-check";
export const AUTO_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

const DEFAULT_RELEASE_URL = "https://github.com/bilirec/bilirec/releases/latest";

export interface VersionCheckRecord {
  at: number;
  serverUrl: string;
}

let autoVersionCheckPromise: Promise<ServerVersionResult | null> | null = null;

function normalizeServerUrl(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function getConfiguredServerUrl(): Promise<string> {
  return normalizeServerUrl(await storage.get<unknown>("server-url"));
}

async function getLastVersionCheck(): Promise<VersionCheckRecord | null> {
  const stored = await storage.get<unknown>(VERSION_LAST_CHECK_KEY);
  if (!stored || typeof stored !== "object") {
    return null;
  }

  const record = stored as Record<string, unknown>;
  return {
    at: typeof record.at === "number" ? record.at : Number.NaN,
    serverUrl: normalizeServerUrl(record.serverUrl)
  };
}

export function isAutoCheckDue(
  record: VersionCheckRecord | null,
  now = Date.now(),
  serverUrl = ""
): boolean {
  if (!record || !Number.isFinite(record.at) || record.at <= 0) {
    return true;
  }

  return (
    record.serverUrl !== normalizeServerUrl(serverUrl) ||
    now - record.at >= AUTO_CHECK_INTERVAL_MS
  );
}

export async function rememberVersionCheck(serverUrl?: string): Promise<void> {
  const currentServerUrl =
    serverUrl === undefined
      ? await getConfiguredServerUrl()
      : normalizeServerUrl(serverUrl);

  await storage.set<VersionCheckRecord>(VERSION_LAST_CHECK_KEY, {
    at: Date.now(),
    serverUrl: currentServerUrl
  });
}

export function isSkippableVersionError(result: ServerVersionResult): boolean {
  return result.error_code === "no_embedded_version";
}

export function getReleaseUrl(result: ServerVersionResult | null | undefined): string {
  return result?.url?.trim() || DEFAULT_RELEASE_URL;
}

export function formatRetryAfter(
  seconds: number | undefined,
  t: TFunction
): string | null {
  if (!seconds || seconds <= 0) {
    return null;
  }

  if (seconds < 60) {
    return t("serverUpdate.waitSeconds", { count: seconds });
  }

  if (seconds < 3600) {
    return t("serverUpdate.waitMinutes", {
      count: Math.ceil(seconds / 60)
    });
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.ceil((seconds % 3600) / 60);

  if (minutes === 0) {
    return t("serverUpdate.waitHours", { count: hours });
  }

  if (minutes === 60) {
    return t("serverUpdate.waitHours", { count: hours + 1 });
  }

  return t("serverUpdate.waitHoursMinutes", { hours, minutes });
}

export function getVersionCheckErrorMessage(
  result: ServerVersionResult,
  t: TFunction
): string {
  if (result.error_code === "github_rate_limit") {
    const wait = formatRetryAfter(result.retry_after_secs, t);
    return wait
      ? t("serverUpdate.rateLimitWait", { wait })
      : t("serverUpdate.rateLimit");
  }
  if (result.error_code === "github_unreachable") {
    return t("serverUpdate.unreachable");
  }
  if (result.error_code === "no_embedded_version") {
    return t("serverUpdate.noEmbeddedVersion");
  }
  return t("serverUpdate.checkFailed");
}

async function performAutoVersionCheck(): Promise<ServerVersionResult | null> {
  const [serverUrl, lastCheck] = await Promise.all([
    getConfiguredServerUrl(),
    getLastVersionCheck()
  ]);

  if (!isAutoCheckDue(lastCheck, Date.now(), serverUrl)) {
    return null;
  }

  try {
    const result = await apiClient.checkVersion();
    await rememberVersionCheck(serverUrl);
    if (isSkippableVersionError(result)) {
      return null;
    }
    return result;
  } catch (error) {
    const parsed = parseVersionError(error);
    if (!parsed) {
      return null;
    }
    await rememberVersionCheck(serverUrl);
    if (isSkippableVersionError(parsed)) {
      return null;
    }
    return parsed;
  }
}

export function runAutoVersionCheck(): Promise<ServerVersionResult | null> {
  if (autoVersionCheckPromise) {
    return autoVersionCheckPromise;
  }

  const promise = performAutoVersionCheck();
  autoVersionCheckPromise = promise;
  promise.then(
    () => {
      if (autoVersionCheckPromise === promise) {
        autoVersionCheckPromise = null;
      }
    },
    () => {
      if (autoVersionCheckPromise === promise) {
        autoVersionCheckPromise = null;
      }
    }
  );
  return promise;
}

export function notifyOutdatedIfNeeded(
  result: ServerVersionResult,
  t: TFunction
): void {
  if (!result.outdated || !result.checked) {
    return;
  }

  const releaseUrl = getReleaseUrl(result);
  toast(t("serverUpdate.toastTitle"), {
    id: "server-update",
    duration: 10000,
    action: {
      label: t("serverUpdate.toastAction"),
      onClick: () => {
        window.open(releaseUrl, "_blank", "noopener,noreferrer");
      }
    }
  });
}

export function maybeAutoCheckVersion(
  onResult: (result: ServerVersionResult) => void,
  t: TFunction
): void {
  void runAutoVersionCheck().then((result) => {
    if (!result) {
      return;
    }
    onResult(result);
    notifyOutdatedIfNeeded(result, t);
  });
}
