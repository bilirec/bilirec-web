import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  startLiveNotifications,
  stopLiveNotifications,
  watchNotificationPermission
} from "@/lib/notifications";

/** Bootstraps web push for admins; viewers only get their subscription cleaned up. */
export function useLiveNotifications(
  isAuthenticated: boolean,
  userRole: string
) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    if (userRole === "viewer") {
      // Viewer role should not receive web push notifications; clean up any existing subscription
      stopLiveNotifications().catch((error) => {
        console.error("Failed to remove viewer push subscription:", error);
      });
      return;
    }

    let cancelled = false;

    const bootstrapNotifications = async () => {
      try {
        const result = await startLiveNotifications();
        if (cancelled) {
          return;
        }

        if (result === "permission-denied-fresh") {
          toast.error(t("toast.notificationBlocked"));
        } else if (result === "push-unavailable") {
          console.error(
            "Web Push bootstrap failed: push-unavailable (check console above for details)"
          );
        } else if (result === "worker-unavailable") {
          console.error("Web Push bootstrap failed: worker-unavailable");
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to start live notifications:", error);
        }
      }
    };

    bootstrapNotifications().catch((error) => {
      console.error("Unexpected bootstrapNotifications rejection:", error);
    });

    const unwatchPermission = watchNotificationPermission((status) => {
      if (cancelled || status === "unsupported") {
        return;
      }

      if (status === "granted" || status === "default") {
        bootstrapNotifications().catch((error) => {
          console.error(
            "Failed to restart live notifications after permission change:",
            error
          );
        });
      }
    });

    return () => {
      cancelled = true;
      unwatchPermission();
    };
  }, [isAuthenticated, userRole]);
}