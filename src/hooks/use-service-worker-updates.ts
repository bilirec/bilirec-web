import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { registerServiceWorker } from "@/lib/service-worker";

/** Registers the service worker and manages the update prompt lifecycle. */
export function useServiceWorkerUpdates() {
  const { t } = useTranslation();

  // ── Service Worker update lifecycle ──────────────────────
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    let cancelled = false;
    let waitingWorker: ServiceWorker | null = null;

    const promptReload = () => {
      toast(t("toast.updateAvailable"), {
        id: "sw-update",
        description: t("toast.updateDownloaded"),
        duration: Infinity,
        action: {
          label: t("toast.updateNow"),
          onClick: () => {
            if (waitingWorker) {
              waitingWorker.postMessage({ type: "SKIP_WAITING" });
            }
          }
        }
      });
    };

    const handleControllerChange = () => {
      // New SW took control — reload to get fresh assets
      window.location.reload();
    };

    const setupUpdateListener = (reg: ServiceWorkerRegistration) => {
      // If there's already a waiting worker, prompt immediately
      if (reg.waiting) {
        waitingWorker = reg.waiting;
        promptReload();
      }

      // Listen for new SW being installed
      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        if (!newWorker) return;

        newWorker.addEventListener("statechange", () => {
          if (
            newWorker.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            // New SW installed but waiting — prompt user
            waitingWorker = newWorker;
            if (!cancelled) {
              promptReload();
            }
          }
        });
      });
    };

    navigator.serviceWorker.addEventListener(
      "controllerchange",
      handleControllerChange
    );

    // Register SW and set up update detection
    const regPromise = registerServiceWorker();
    if (regPromise) {
      regPromise.then((reg) => {
        if (cancelled) return;
        setupUpdateListener(reg);
      });
    }

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        handleControllerChange
      );
    };
  }, [t]);
}