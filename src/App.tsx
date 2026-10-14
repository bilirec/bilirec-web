import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { LoginView } from "@/components/LoginView";
import { AppHeader } from "@/components/AppHeader";
import { ViewerConnectScreen } from "@/components/ViewerConnectScreen";
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
import { useLanguage } from "@/hooks/use-language";
import { getStoredLanguage, type AppLanguage } from "@/lib/language";
import { Toaster } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import type { DiskUsage, ServerVersionResult } from "@/lib/types";
import { maybeAutoCheckVersion } from "@/lib/server-version";
import { RoleContext } from "@/lib/role-context";
import { ANALYTICS_ENABLED, isReportableAnalyticsVersion } from "@/lib/analytics";
import { VIEWER_MODE_ENABLED } from "@/lib/viewer-mode";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useServiceWorkerUpdates } from "@/hooks/use-service-worker-updates";
import { useBilibiliAuth } from "@/hooks/use-bilibili-auth";
import { useLiveNotifications } from "@/hooks/use-live-notifications";
import { useDiskUsage } from "@/hooks/use-disk-usage";
import { useAnalyticsSession } from "@/hooks/use-analytics-session";

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
  const { language, setLanguage } = useLanguage();

  const [activeTab, setActiveTab] = useState<AppTab>(
    VIEWER_MODE_ENABLED ? "files" : "records"
  );
  const [pinnedRoomId, setPinnedRoomId] = useState<number | null>(null);
  const [serverVersion, setServerVersion] = useState<ServerVersionResult | null>(null);
  const [diskUsage, setDiskUsage] = useState<DiskUsage | null>(null);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isBilibiliDialogOpen, setIsBilibiliDialogOpen] = useState(false);
  const [isDocumentFullscreen, setIsDocumentFullscreen] = useState(false);

  const auth = useAuthSession({
    onVersion: setServerVersion,
    onDiskUsage: setDiskUsage
  });
  const { isAuthenticated, isCheckingAuth, userRole, userName, isReadOnly } = auth;

  const bilibili = useBilibiliAuth(isAuthenticated, userRole);
  useDiskUsage(isAuthenticated, setDiskUsage);
  useServiceWorkerUpdates();
  useLiveNotifications(isAuthenticated, userRole);
  const { analyticsConsent, handleAnalyticsConsentChange } = useAnalyticsSession({
    isAuthenticated,
    serverVersion,
    onVersion: setServerVersion
  });

  const showServerOutdatedBadge =
    Boolean(serverVersion?.outdated && serverVersion?.checked);

  const handleServerVersionResult = (result: ServerVersionResult) => {
    setServerVersion(result);
  };

  const handleTabChange = (tab: AppTab) => {
    if (tab !== "subscribe") setPinnedRoomId(null);
    setActiveTab(tab);
  };

  useEffect(() => {
    if (isCheckingAuth || !isAuthenticated) {
      return;
    }

    maybeAutoCheckVersion(handleServerVersionResult, t);
  }, [isCheckingAuth, isAuthenticated, t]);

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
    if (VIEWER_MODE_ENABLED) {
      return (
        <>
          <ViewerConnectScreen
            onRetry={() => void auth.retryConnect()}
            isRetrying={isCheckingAuth}
          />
          <Toaster richColors position="top-center" />
        </>
      );
    }

    return (
      <>
        <LoginView onLoginSuccess={auth.handleLoginSuccess} />
        <Toaster richColors position="top-center" />
      </>
    );
  }

  return (
    <RoleContext.Provider value={{ role: userRole, userName, isReadOnly }}>
      <div className="min-h-screen bg-background overflow-x-hidden">
        <AppHeader
          diskUsage={diskUsage}
          serverVersion={serverVersion}
          bilibiliButtonVisible={bilibili.bilibiliButtonVisible}
          bilibiliAuthStatus={bilibili.bilibiliAuthStatus}
          onRefreshBilibiliStatus={bilibili.refreshBilibiliStatus}
          onOpenBilibiliDialog={() => setIsBilibiliDialogOpen(true)}
          onOpenAbout={() => setIsAboutOpen(true)}
          onLogout={auth.handleLogout}
          showLogout={!VIEWER_MODE_ENABLED}
          showServerOutdatedBadge={showServerOutdatedBadge}
        />

        {bilibili.bilibiliButtonVisible && (
          <BilibiliAuthDialog
            open={isBilibiliDialogOpen}
            onOpenChange={setIsBilibiliDialogOpen}
            initialStatus={bilibili.bilibiliAuthStatus}
            onStatusChange={bilibili.setBilibiliAuthStatus}
            onControllerUnsupported={() =>
              bilibili.setBilibiliButtonVisible(false)
            }
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