import { useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api";
import {
  ANALYTICS_ENABLED,
  disableAnalytics,
  getAnalyticsConsent,
  setAnalyticsConsent as persistAnalyticsConsent,
  setAnalyticsServerVersion,
  type AnalyticsConsent
} from "@/lib/analytics";
import type { ServerVersionResult } from "@/lib/types";

interface UseAnalyticsSessionOptions {
  isAuthenticated: boolean;
  serverVersion: ServerVersionResult | null;
  onVersion: (version: ServerVersionResult | null) => void;
}

/** Manages analytics consent state and its server-version wiring. */
export function useAnalyticsSession({
  isAuthenticated,
  serverVersion,
  onVersion
}: UseAnalyticsSessionOptions) {
  const [analyticsConsent, setAnalyticsConsentState] = useState<
    AnalyticsConsent | null
  >(() => getAnalyticsConsent());

  const onVersionRef = useRef(onVersion);
  onVersionRef.current = onVersion;

  const handleAnalyticsConsentChange = (consent: AnalyticsConsent) => {
    if (!ANALYTICS_ENABLED) {
      return;
    }

    persistAnalyticsConsent(consent);
    setAnalyticsConsentState(consent);

    if (consent !== "granted") {
      disableAnalytics();
    }
  };

  useEffect(() => {
    if (
      !ANALYTICS_ENABLED ||
      !isAuthenticated ||
      analyticsConsent !== "granted"
    ) {
      if (ANALYTICS_ENABLED) {
        disableAnalytics();
      }
    }
  }, [analyticsConsent, isAuthenticated]);

  useEffect(() => {
    if (!ANALYTICS_ENABLED || !isAuthenticated) {
      return;
    }

    let cancelled = false;

    const loadAnalyticsVersion = async () => {
      try {
        const result = await apiClient.getVersion();
        if (cancelled) {
          return;
        }
        onVersionRef.current(result);
      } catch (error) {
        if (!cancelled) {
          console.debug("Failed to load server version for analytics:", error);
        }
      }
    };

    void loadAnalyticsVersion();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (
      !ANALYTICS_ENABLED ||
      !isAuthenticated ||
      analyticsConsent !== "granted"
    ) {
      return;
    }

    const current = serverVersion?.current?.trim();
    if (!current || current.toLowerCase() === "unknown") {
      return;
    }

    setAnalyticsServerVersion(current);
  }, [analyticsConsent, isAuthenticated, serverVersion?.current]);

  return { analyticsConsent, handleAnalyticsConsentChange };
}