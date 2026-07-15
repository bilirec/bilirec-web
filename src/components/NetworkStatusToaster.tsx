import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { CheckIcon, CircleNotchIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  bindBrowserNetworkEvents,
  subscribeNetworkStatus,
  type NetworkStatus,
} from "@/lib/network-status";

const NETWORK_TOAST_ID = "network-status";

export function NetworkStatusToaster() {
  const { t } = useTranslation();
  const previousStatusRef = useRef<NetworkStatus | null>(null);

  useEffect(() => {
    return bindBrowserNetworkEvents();
  }, []);

  useEffect(() => {
    return subscribeNetworkStatus((status) => {
      const previous = previousStatusRef.current;
      previousStatusRef.current = status;

      if (status === "offline") {
        toast.error(t("toast.networkReconnecting"), {
          id: NETWORK_TOAST_ID,
          duration: Infinity,
          dismissible: false,
          icon: <CircleNotchIcon className="size-4 animate-spin" />,
        });
        return;
      }

      // Only celebrate recovery after we were offline (skip initial online)
      if (previous === "offline") {
        // Same toast id merges options; must replace spinner icon explicitly
        toast.success(t("toast.networkRestored"), {
          id: NETWORK_TOAST_ID,
          duration: 3000,
          dismissible: true,
          icon: <CheckIcon className="size-4" weight="bold" />,
        });
      }
    });
  }, [t]);

  return null;
}
