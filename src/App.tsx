import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { useTranslation } from "react-i18next";
import { LoginView } from "@/components/LoginView";
import { RecordsView } from "@/components/RecordsView";
import { FilesView } from "@/components/FilesView";
import { ConvertsView } from "@/components/ConvertsView";
import { SubscribesView } from "@/components/SubscribesView";
import { BilibiliAuthDialog } from "@/components/BilibiliAuthDialog";
import { AboutDialog } from "@/components/AboutDialog";
import { AnalyticsConsentNotice } from "@/components/AnalyticsConsentNotice";
import { NetworkStatusToaster } from "@/components/NetworkStatusToaster";
import { BottomNav } from "@/components/BottomNav";
import { LeftSidebar } from "@/components/LeftSidebar";
import { DiskUsageDisplay } from "@/components/DiskUsageDisplay";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { useLanguage } from "@/hooks/use-language";
import { getStoredLanguage, type AppLanguage } from "@/lib/language";
import {
  SignOutIcon,
  SunIcon,
  MoonIcon,
  MonitorIcon,
  TranslateIcon,
  GearIcon,
  CheckIcon,
  UserIcon,
  InfoIcon
} from "@phosphor-icons/react";
import { apiClient } from "@/lib/api";
import {
  startLiveNotifications,
  stopLiveNotifications,
  watchNotificationPermission
} from "@/lib/notifications";
import { registerServiceWorker } from "@/lib/service-worker";
import { storage } from "@/lib/storage";
import { toast, Toaster } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import type { DiskUsage, LoginResponse, ServerVersionResult } from "@/lib/types";
import type { BilibiliAuthStatus } from "@/lib/types";
import {
  clearVersionAutoCheckGate,
  maybeAutoCheckVersion
} from "@/lib/server-version";
import { RoleContext } from "@/lib/role-context";
import {
  ANALYTICS_ENABLED,
  disableAnalytics,
  getAnalyticsConsent,
  isReportableAnalyticsVersion,
  setAnalyticsConsent as persistAnalyticsConsent,
  setAnalyticsServerVersion,
  type AnalyticsConsent
} from "@/lib/analytics";

type AppTab = "records" | "files" | "converts" | "subscribe";

function getTabFromSearch(search: string): AppTab | null {
  const params = new URLSearchParams(search);
  const tab = params.get("tab");
  return tab === "records" ||
    tab === "files" ||
    tab === "converts" ||
    tab === "subscribe"
    ? tab
    : null;
}

function getPinnedRoomFromSearch(search: string): number | null {
  const params = new URLSearchParams(search);
  const id = Number(params.get("pinnedRoom"));
  return isNaN(id) || id === 0 ? null : id;
}

function App() {
  const { t } = useTranslation();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const { language, setLanguage } = useLanguage();

  const ThemeTriggerIcon =
    theme === "dark"
      ? MoonIcon
      : theme === "light"
      ? SunIcon
      : resolvedTheme === "dark"
      ? MoonIcon
      : SunIcon;

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [activeTab, setActiveTab] = useState<AppTab>("records");
  const [pinnedRoomId, setPinnedRoomId] = useState<number | null>(null);
  const [diskUsage, setDiskUsage] = useState<DiskUsage | null>(null);
  const [userRole, setUserRole] = useState<string>(
    () => localStorage.getItem("user-role") ?? "admin"
  );
  const [userName, setUserName] = useState<string>(
    () => localStorage.getItem("user-name") ?? ""
  );
  const [bilibiliButtonVisible, setBilibiliButtonVisible] = useState(false);
  const [bilibiliAuthStatus, setBilibiliAuthStatus] = useState<BilibiliAuthStatus | null>(null);
  const [isBilibiliDialogOpen, setIsBilibiliDialogOpen] = useState(false);
  const [serverVersion, setServerVersion] = useState<ServerVersionResult | null>(null);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [analyticsConsent, setAnalyticsConsentState] =
    useState<AnalyticsConsent | null>(() => getAnalyticsConsent());
  const [isDocumentFullscreen, setIsDocumentFullscreen] = useState(false);

  const isReadOnly = userRole === "viewer";
  const showServerOutdatedBadge =
    Boolean(serverVersion?.outdated && serverVersion?.checked);

  const handleServerVersionResult = (result: ServerVersionResult) => {
    setServerVersion(result);
  };

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

  const isUnsupportedStatus = (statusCode: number | undefined) => statusCode === 400 || statusCode === 404 || statusCode === 403

  const handleThemeChange = (newTheme: "light" | "dark" | "system") => {
    setTheme(newTheme);
  };

  const handleLanguageChange = async (nextLanguage: AppLanguage) => {
    await setLanguage(nextLanguage);
  };

  const handleTabChange = (tab: AppTab) => {
    if (tab !== "subscribe") setPinnedRoomId(null);
    setActiveTab(tab);
  };

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const serverUrl = await storage.get<string>("server-url");
        if (serverUrl) {
          apiClient.setBaseURL(serverUrl);
          const version = await apiClient.probeBackend();
          if (version) {
            setServerVersion(version);
          }
          setIsAuthenticated(true);
          // Restore role from localStorage (already initialised in useState)
          // Fetch initial disk usage
          try {
            const usage = await apiClient.getDiskUsage();
            setDiskUsage(usage);
          } catch (error) {
            console.error("Failed to fetch disk usage:", error);
          }
        }
      } catch (error) {
        console.error("Auth check failed:", error);
      } finally {
        setIsCheckingAuth(false);
      }
    };

    checkAuth();

    const onUnauthorized = () => {
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
  }, [t]);

  useEffect(() => {
    let cancelled = false;

    const syncStoredLanguage = async () => {
      const storedLanguage = await getStoredLanguage();
      if (cancelled || !storedLanguage || storedLanguage === language) {
        return;
      }
      await setLanguage(storedLanguage);
    };

    syncStoredLanguage().catch((error) => {
      console.error("Failed to sync language preference:", error);
    });

    return () => {
      cancelled = true;
    };
  }, [language, setLanguage]);

  useEffect(() => {
    const tabFromUrl = getTabFromSearch(window.location.search);
    if (tabFromUrl) setActiveTab(tabFromUrl);
    const pinnedRoom = getPinnedRoomFromSearch(window.location.search);
    if (pinnedRoom) setPinnedRoomId(pinnedRoom);
    // Clean notification params from URL so a page refresh doesn't re-apply them
    if (tabFromUrl || pinnedRoom) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    const syncFullscreenState = () => {
      setIsDocumentFullscreen(Boolean(document.fullscreenElement));
    };

    syncFullscreenState();
    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () =>
      document.removeEventListener("fullscreenchange", syncFullscreenState);
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const handleMessage = (event: MessageEvent) => {
      if (
        event.data?.type === "notification-click" &&
        event.data.tab === "subscribe"
      ) {
        setActiveTab("subscribe");
        if (typeof event.data.roomId === "number") {
          setPinnedRoomId(event.data.roomId);
        }
      }
    };

    navigator.serviceWorker.addEventListener("message", handleMessage);
    return () =>
      navigator.serviceWorker.removeEventListener("message", handleMessage);
  }, []);

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

  // Refresh disk usage every 30 seconds when authenticated
  useEffect(() => {
    if (!isAuthenticated) return;

    const fetchDiskUsage = async () => {
      try {
        const usage = await apiClient.getDiskUsage();
        setDiskUsage(usage);
      } catch (error) {
        console.error("Failed to fetch disk usage:", error);
      }
    };

    fetchDiskUsage();
    const interval = setInterval(fetchDiskUsage, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
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
  }, [isAuthenticated]);

  const refreshBilibiliStatus = async () => {
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
        setServerVersion(result);
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
      setServerVersion(version);
    }
    setIsAuthenticated(true);
    maybeAutoCheckVersion(handleServerVersionResult, t);
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
      clearVersionAutoCheckGate();
      setIsAuthenticated(false);
      setServerVersion(null);
      localStorage.removeItem("user-role");
      localStorage.removeItem("user-name");
      setUserRole("admin");
      setUserName("");
      toast.success(t("toast.logoutSuccess"));
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-full">
            <svg
              className="w-8 h-8 text-primary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <circle cx="12" cy="12" r="10" strokeWidth="2" />
              <circle cx="12" cy="12" r="3" fill="currentColor" />
            </svg>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        <LoginView onLoginSuccess={handleLoginSuccess} />
        <Toaster richColors position="top-center" />
      </>
    );
  }

  return (
    <RoleContext.Provider value={{ role: userRole, userName, isReadOnly }}>
      <div className="min-h-screen bg-background overflow-x-hidden">
        <div className="sticky top-0 z-40 bg-card/95 backdrop-blur-md border-b border-border">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-primary"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <circle cx="12" cy="12" r="10" strokeWidth="2" />
                  <circle cx="12" cy="12" r="3" fill="currentColor" />
                </svg>
              </div>
              <div>
                <h1 className="font-bold text-lg leading-none mb-1 text-card-foreground">
                  Bilirec
                </h1>
                <p className="text-xs text-muted-foreground">
                  {t("app.subtitle")}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <DiskUsageDisplay diskUsage={diskUsage} compact={true} />

              <div className="hidden sm:flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 text-card-foreground hover:text-primary rounded-md p-1 hover:bg-secondary/10 dark:hover:bg-secondary/10 hover:scale-[1.02]"
                      aria-label={t("actions.language")}
                    >
                      <TranslateIcon size={18} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuLabel>{t("actions.language")}</DropdownMenuLabel>
                    {(["zh-TW", "zh-CN"] as AppLanguage[]).map((lang) => (
                      <DropdownMenuItem
                        key={lang}
                        onSelect={() => void handleLanguageChange(lang)}
                        className={`gap-2 cursor-pointer ${
                          language === lang
                            ? "bg-primary/10 text-primary font-medium"
                            : "text-muted-foreground"
                        }`}
                      >
                        <span className="w-4 shrink-0">
                          {language === lang && <CheckIcon size={14} weight="bold" />}
                        </span>
                        {lang === "zh-TW" ? t("language.traditionalChinese") : t("language.simplifiedChinese")}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                {bilibiliButtonVisible && (
                  <DropdownMenu onOpenChange={(open) => {
                    if (open) {
                      void refreshBilibiliStatus();
                    }
                  }}>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0 text-card-foreground hover:text-primary rounded-md p-1 hover:bg-secondary/10 dark:hover:bg-secondary/10 hover:scale-[1.02]"
                        aria-label={t("bilibiliAuth.title")}
                      >
                        <UserIcon size={18} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <div className="px-3 py-3 flex flex-col gap-3">
                        <div className="flex items-center gap-3">
                          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
                            bilibiliAuthStatus?.authenticated ? 'bg-green-500' : 'bg-muted-foreground/40'
                          }`}>
                            {bilibiliAuthStatus?.authenticated
                              ? (bilibiliAuthStatus.account?.uname?.[0]?.toUpperCase() ?? 'B')
                              : 'B'}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-xs text-muted-foreground">
                              {bilibiliAuthStatus?.authenticated ? t("bilibiliAuth.loggedIn") : t("bilibiliAuth.notLoggedIn")}
                            </span>
                            <span className="text-sm font-medium text-foreground break-all">
                              {bilibiliAuthStatus?.authenticated
                                ? (bilibiliAuthStatus.account?.uname || '-')
                                : '-'}
                            </span>
                          </div>
                        </div>
                        <Button
                          onClick={() => setIsBilibiliDialogOpen(true)}
                          size="sm"
                          variant={bilibiliAuthStatus?.authenticated ? 'outline' : 'default'}
                          className="cursor-pointer w-full"
                        >
                          {bilibiliAuthStatus?.authenticated ? t("bilibiliAuth.switchAccount") : t("bilibiliAuth.login")}
                        </Button>
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  className="relative shrink-0 text-card-foreground hover:text-primary rounded-md p-1 hover:bg-secondary/10 dark:hover:bg-secondary/10 hover:scale-[1.02]"
                  aria-label={t("about.title")}
                  onClick={() => setIsAboutOpen(true)}
                >
                  <InfoIcon size={18} />
                  {showServerOutdatedBadge ? (
                    <span className="absolute top-0.5 right-0.5 h-2 w-2 rounded-full bg-destructive" />
                  ) : null}
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 mr-2 text-card-foreground hover:text-primary rounded-md p-1 hover:bg-secondary/10 dark:hover:bg-secondary/10 hover:scale-[1.02]"
                      aria-label={t("actions.switchTheme")}
                    >
                      <ThemeTriggerIcon size={18} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuLabel>{t("actions.theme")}</DropdownMenuLabel>
                    {(["light", "dark", "system"] as const).map((t_val) => (
                      <DropdownMenuItem
                        key={t_val}
                        onSelect={() => handleThemeChange(t_val)}
                        className={`gap-2 cursor-pointer ${
                          theme === t_val
                            ? "bg-primary/10 text-primary font-medium"
                            : "text-muted-foreground"
                        }`}
                      >
                        <span className="w-4 shrink-0">
                          {theme === t_val && <CheckIcon size={14} weight="bold" />}
                        </span>
                        {t_val === "light" ? <SunIcon size={14} /> : t_val === "dark" ? <MoonIcon size={14} /> : <MonitorIcon size={14} />}
                        {t_val === "light" ? t("actions.themeLight") : t_val === "dark" ? t("actions.themeDark") : t("actions.themeSystem")}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="flex sm:hidden items-center gap-2">
                <DropdownMenu onOpenChange={(open) => {
                  if (open && bilibiliButtonVisible) {
                    void refreshBilibiliStatus();
                  }
                }}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 text-card-foreground hover:text-primary rounded-md p-1 hover:bg-secondary/10 dark:hover:bg-secondary/10 hover:scale-[1.02]"
                      aria-label={t("actions.settings")}
                    >
                      <GearIcon size={18} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    {bilibiliButtonVisible && (
                      <>
                        <div className="px-3 py-3 flex flex-col gap-3">
                          <div className="flex items-center gap-3">
                            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
                              bilibiliAuthStatus?.authenticated ? 'bg-green-500' : 'bg-muted-foreground/40'
                            }`}>
                              {bilibiliAuthStatus?.authenticated
                                ? (bilibiliAuthStatus.account?.uname?.[0]?.toUpperCase() ?? 'B')
                                : 'B'}
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className="text-xs text-muted-foreground">
                                {bilibiliAuthStatus?.authenticated ? t("bilibiliAuth.loggedIn") : t("bilibiliAuth.notLoggedIn")}
                              </span>
                              <span className="text-sm font-medium text-foreground break-all">
                                {bilibiliAuthStatus?.authenticated
                                  ? (bilibiliAuthStatus.account?.uname || '-')
                                  : '-'}
                              </span>
                            </div>
                          </div>
                          <Button
                            onClick={() => setIsBilibiliDialogOpen(true)}
                            size="sm"
                            variant={bilibiliAuthStatus?.authenticated ? 'outline' : 'default'}
                            className="cursor-pointer w-full"
                          >
                            {bilibiliAuthStatus?.authenticated ? t("bilibiliAuth.switchAccount") : t("bilibiliAuth.login")}
                          </Button>
                        </div>
                        <DropdownMenuSeparator />
                      </>
                    )}
                    <DropdownMenuLabel>{t("actions.theme")}</DropdownMenuLabel>
                    {(["light", "dark", "system"] as const).map((t_val) => (
                      <DropdownMenuItem
                        key={t_val}
                        onSelect={() => handleThemeChange(t_val)}
                        className={`gap-2 cursor-pointer ${
                          theme === t_val
                            ? "bg-primary/10 text-primary font-medium"
                            : "text-muted-foreground"
                        }`}
                      >
                        <span className="w-4 shrink-0">
                          {theme === t_val && <CheckIcon size={14} weight="bold" />}
                        </span>
                        {t_val === "light" ? <SunIcon size={14} /> : t_val === "dark" ? <MoonIcon size={14} /> : <MonitorIcon size={14} />}
                        {t_val === "light" ? t("actions.themeLight") : t_val === "dark" ? t("actions.themeDark") : t("actions.themeSystem")}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>{t("actions.language")}</DropdownMenuLabel>
                    {(["zh-TW", "zh-CN"] as AppLanguage[]).map((lang) => (
                      <DropdownMenuItem
                        key={lang}
                        onSelect={() => void handleLanguageChange(lang)}
                        className={`gap-2 cursor-pointer ${
                          language === lang
                            ? "bg-primary/10 text-primary font-medium"
                            : "text-muted-foreground"
                        }`}
                      >
                        <span className="w-4 shrink-0">
                          {language === lang && <CheckIcon size={14} weight="bold" />}
                        </span>
                        {lang === "zh-TW" ? t("language.traditionalChinese") : t("language.simplifiedChinese")}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>{t("about.section")}</DropdownMenuLabel>
                    <DropdownMenuItem
                      onSelect={() => setIsAboutOpen(true)}
                      className="gap-2 cursor-pointer text-muted-foreground"
                    >
                      <InfoIcon size={14} className="shrink-0" />
                      {t("about.menuItem")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="shrink-0 text-card-foreground hover:text-destructive rounded-md p-1 hover:bg-secondary/10 dark:hover:bg-secondary/10 hover:scale-[1.02]"
                aria-label={t("actions.logout")}
              >
                <SignOutIcon size={20} />
              </Button>
            </div>
          </div>
        </div>

        {bilibiliButtonVisible && (
          <BilibiliAuthDialog
            open={isBilibiliDialogOpen}
            onOpenChange={setIsBilibiliDialogOpen}
            initialStatus={bilibiliAuthStatus}
            onStatusChange={setBilibiliAuthStatus}
            onControllerUnsupported={() => setBilibiliButtonVisible(false)}
          />
        )}

        <AboutDialog
          open={isAboutOpen}
          onOpenChange={setIsAboutOpen}
          version={serverVersion}
          onVersionChange={setServerVersion}
          analyticsConsent={analyticsConsent}
          onAnalyticsConsentChange={handleAnalyticsConsentChange}
        />

        {ANALYTICS_ENABLED &&
        analyticsConsent === null &&
        isReportableAnalyticsVersion(serverVersion?.current) &&
        !isDocumentFullscreen ? (
          <AnalyticsConsentNotice
            onConsentChange={handleAnalyticsConsentChange}
          />
        ) : null}

        <div className="h-[calc(100vh-73px)] overflow-x-hidden flex">
          <LeftSidebar
            activeTab={activeTab}
            onTabChange={handleTabChange}
            diskUsage={diskUsage}
          />

          <div className="flex-1">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="h-full"
              >
                {activeTab === "records" ? (
                  <RecordsView />
                ) : activeTab === "files" ? (
                  <FilesView />
                ) : activeTab === "converts" ? (
                  <ConvertsView />
                ) : (
                  <SubscribesView pinnedRoomId={pinnedRoomId} />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />
        <NetworkStatusToaster />
        <Toaster richColors position="top-center" />
      </div>
    </RoleContext.Provider>
  );
}

export default App;
