import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api";
import type { BilibiliAuthStatus } from "@/lib/types";

const isUnsupportedStatus = (statusCode: number | undefined) =>
  statusCode === 400 || statusCode === 404 || statusCode === 403;

/** Loads and refreshes the Bilibili account auth status for admins. */
export function useBilibiliAuth(isAuthenticated: boolean, userRole: string) {
  const [bilibiliButtonVisible, setBilibiliButtonVisible] = useState(false);
  const [bilibiliAuthStatus, setBilibiliAuthStatus] =
    useState<BilibiliAuthStatus | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      setBilibiliAuthStatus(null);
      return;
    }

    if (userRole !== "admin") {
      setBilibiliButtonVisible(false);
      setBilibiliAuthStatus(null);
      return;
    }

    let cancelled = false;

    const loadBilibiliStatus = async () => {
      try {
        const status = await apiClient.getBilibiliAuthStatus();
        if (cancelled) {
          return;
        }
        setBilibiliButtonVisible(true);
        setBilibiliAuthStatus(status);
      } catch (error: any) {
        if (cancelled) {
          return;
        }
        if (isUnsupportedStatus(error?.response?.status)) {
          console.debug("Bilibili auth endpoint is unsupported, hiding related UI");
          setBilibiliButtonVisible(false);
          setBilibiliAuthStatus(null);
          return;
        }
        console.debug("Bilibili auth endpoint is supported, showing related UI");
        setBilibiliButtonVisible(true);
      }
    };

    void loadBilibiliStatus();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, userRole]);

  const refreshBilibiliStatus = async () => {
    if (userRole !== "admin") {
      return null;
    }
    try {
      const status = await apiClient.getBilibiliAuthStatus();
      setBilibiliButtonVisible(true);
      setBilibiliAuthStatus(status);
      return status;
    } catch (error: any) {
      if (isUnsupportedStatus(error?.response?.status)) {
        setBilibiliButtonVisible(false);
        setBilibiliAuthStatus(null);
        return null;
      }
      return bilibiliAuthStatus;
    }
  };

  return {
    bilibiliButtonVisible,
    bilibiliAuthStatus,
    setBilibiliAuthStatus,
    setBilibiliButtonVisible,
    refreshBilibiliStatus
  };
}