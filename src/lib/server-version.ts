import type { TFunction } from "i18next";
import { toast } from "sonner";
import { apiClient, parseVersionError } from "@/lib/api";
import type { ServerVersionResult } from "@/lib/types";

export const VERSION_AUTO_CHECK_KEY = "bilirec-version-auto-checked";

const DEFAULT_RELEASE_URL = "https://github.com/bilirec/bilirec/releases/latest";

export function clearVersionAutoCheckGate(): void {
  sessionStorage.removeItem(VERSION_AUTO_CHECK_KEY);
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

export async function runAutoVersionCheck(): Promise<ServerVersionResult | null> {
  if (sessionStorage.getItem(VERSION_AUTO_CHECK_KEY)) {
    return null;
  }

  sessionStorage.setItem(VERSION_AUTO_CHECK_KEY, "1");

  try {
    const result = await apiClient.checkVersion();
    if (isSkippableVersionError(result)) {
      return null;
    }
    return result;
  } catch (error) {
    const parsed = parseVersionError(error);
    if (!parsed || isSkippableVersionError(parsed)) {
      return null;
    }
    return parsed;
  }
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
