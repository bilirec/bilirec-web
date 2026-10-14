import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { apiClient } from "@/lib/api";
import { stopLiveNotifications } from "@/lib/notifications";
import { storage } from "@/lib/storage";
import type {
  DiskUsage,
  LoginResponse,
  ServerVersionResult
} from "@/lib/types";
import {
  VIEWER_CREDENTIALS_PROVIDED,
  VIEWER_MODE_ENABLED,
  VIEWER_PASSWORD,
  VIEWER_SERVER_URL,
  VIEWER_USERNAME
} from "@/lib/viewer-mode";

interface UseAuthSessionOptions {
  onVersion: (version: ServerVersionResult | null) => void;
  onDiskUsage: (usage: DiskUsage) => void;
}

/**
 * Owns the app authentication session: initial auth check (normal or
 * build-time viewer mode), login/logout handlers and 401 handling.
 * Server version and disk usage state live in the caller; results are
 * reported through the callbacks.
 */
export function useAuthSession({
  onVersion,
  onDiskUsage
}: UseAuthSessionOptions) {
  const { t } = useTranslation();

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [userRole, setUserRole] = useState<string>(
    () => localStorage.getItem("user-role") ?? "admin"
  );
  const [userName, setUserName] = useState<string>(
    () => localStorage.getItem("user-name") ?? ""
  );

  // Latest-callback refs so effects and stable callbacks never depend on
  // (potentially unstable) caller functions.
  const onVersionRef = useRef(onVersion);
  const onDiskUsageRef = useRef(onDiskUsage);
  onVersionRef.current = onVersion;
  onDiskUsageRef.current = onDiskUsage;

  const fetchInitialDiskUsage = useCallback(async () => {
    try {
      const usage = await apiClient.getDiskUsage();
      onDiskUsageRef.current(usage);
    } catch (error) {
      console.error("Failed to fetch disk usage:", error);
    }
  }, []);

  const connectViewerMode = useCallback(
    async (options?: { showChecking?: boolean }) => {
      const showChecking = options?.showChecking ?? true;
      if (showChecking) {
        setIsCheckingAuth(true);
      }
      try {
        await apiClient.runWithoutUnauthorizedEvent(async () => {
          apiClient.setBaseURL(VIEWER_SERVER_URL);
          await storage.set("server-url", VIEWER_SERVER_URL);

          let loginResponse: LoginResponse | null = null;
          if (VIEWER_CREDENTIALS_PROVIDED) {
            loginResponse = await apiClient.login({
              user: VIEWER_USERNAME,
              pass: VIEWER_PASSWORD
            });
            if (!loginResponse) {
              throw new Error("viewer login failed");
            }
          }

          const version = await apiClient.probeBackend();
          const role = loginResponse?.role || "viewer";
          const user = loginResponse?.user || "";
          localStorage.setItem("user-role", role);
          if (user) {
            localStorage.setItem("user-name", user);
          } else {
            localStorage.removeItem("user-name");
          }
          setUserRole(role);
          setUserName(user);
          if (version) {
            onVersionRef.current(version);
          }
          setIsAuthenticated(true);

          await fetchInitialDiskUsage();
        });
      } catch (error) {
        console.error("Viewer mode connect failed:", error);
        setIsAuthenticated(false);
      } finally {
        if (showChecking) {
          setIsCheckingAuth(false);
        }
      }
    },
    [fetchInitialDiskUsage]
  );

  useEffect(() => {
    const checkAuth = async () => {
      if (VIEWER_MODE_ENABLED) {
        await connectViewerMode();
        return;
      }

      try {
        const serverUrl = await storage.get<string>("server-url");
        if (serverUrl) {
          apiClient.setBaseURL(serverUrl);
          const version = await apiClient.probeBackend();
          if (version) {
            onVersionRef.current(version);
          }
          setIsAuthenticated(true);
          // Restore role from localStorage (already initialised in useState)
          // Fetch initial disk usage
          await fetchInitialDiskUsage();
        }
      } catch (error) {
        console.error("Auth check failed:", error);
      } finally {
        setIsCheckingAuth(false);
      }
    };

    checkAuth();

    const onUnauthorized = () => {
      if (VIEWER_MODE_ENABLED) {
        toast.error(t("toast.viewerReconnecting"));
        void connectViewerMode({ showChecking: false });
        return;
      }

      setIsAuthenticated(false);
      setIsCheckingAuth(false);
      localStorage.removeItem("user-role");
      localStorage.removeItem("user-name");
      setUserRole("admin");
      setUserName("");
      stopLiveNotifications().catch((error) => {
        console.error(
          "Failed to stop live notifications after unauthorized:",
          error
        );
      });
      toast.error(t("toast.sessionExpired"));
    };

    window.addEventListener("api:unauthorized", onUnauthorized);
    return () => window.removeEventListener("api:unauthorized", onUnauthorized);
  }, [t, connectViewerMode]);

  const handleLoginSuccess = (
    response: LoginResponse,
    version: ServerVersionResult | null
  ) => {
    const role = response.role || "admin";
    const user = response.user || "";
    localStorage.setItem("user-role", role);
    if (user) localStorage.setItem("user-name", user);
    setUserRole(role);
    setUserName(user);
    if (version) {
      onVersionRef.current(version);
    }
    setIsAuthenticated(true);
    if (user) {
      toast.success(t("toast.welcomeBack", { user }));
    } else {
      toast.success(t("toast.loginSuccess"));
    }
  };

  const handleLogout = async () => {
    try {
      // Notify server to clear HttpOnly cookie
      await apiClient.logout();
      await stopLiveNotifications();
      setIsAuthenticated(false);
      onVersionRef.current(null);
      localStorage.removeItem("user-role");
      localStorage.removeItem("user-name");
      setUserRole("admin");
      setUserName("");
      toast.success(t("toast.logoutSuccess"));
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  return {
    isAuthenticated,
    isCheckingAuth,
    userRole,
    userName,
    isReadOnly: userRole === "viewer",
    /** Manual viewer-mode reconnect (retry button on the connect screen). */
    retryConnect: () => connectViewerMode(),
    handleLoginSuccess,
    handleLogout
  };
}