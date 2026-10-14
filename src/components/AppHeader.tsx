import { useTranslation } from "react-i18next";
import { useTheme } from "next-themes";
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
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { DiskUsageDisplay } from "@/components/DiskUsageDisplay";
import { useLanguage } from "@/hooks/use-language";
import type { AppLanguage } from "@/lib/language";
import type {
  BilibiliAuthStatus,
  DiskUsage,
  ServerVersionResult
} from "@/lib/types";
import { VIEWER_MODE_ENABLED } from "@/lib/viewer-mode";

interface AppHeaderProps {
  diskUsage: DiskUsage | null;
  serverVersion: ServerVersionResult | null;
  bilibiliButtonVisible: boolean;
  bilibiliAuthStatus: BilibiliAuthStatus | null;
  onRefreshBilibiliStatus: () => Promise<BilibiliAuthStatus | null>;
  onOpenBilibiliDialog: () => void;
  onOpenAbout: () => void;
  onLogout: () => void;
  showLogout: boolean; // = !VIEWER_MODE_ENABLED
  showServerOutdatedBadge: boolean;
}

/** Theme picker items shared by the desktop dropdown and the mobile menu. */
function ThemeMenuItems() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();

  return (
    <>
      <DropdownMenuLabel>{t("actions.theme")}</DropdownMenuLabel>
      {(["light", "dark", "system"] as const).map((t_val) => (
        <DropdownMenuItem
          key={t_val}
          onSelect={() => setTheme(t_val)}
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
    </>
  );
}

/** Language picker items shared by the desktop dropdown and the mobile menu. */
function LanguageMenuItems() {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();

  return (
    <>
      <DropdownMenuLabel>{t("actions.language")}</DropdownMenuLabel>
      {(["zh-TW", "zh-CN"] as AppLanguage[]).map((lang) => (
        <DropdownMenuItem
          key={lang}
          onSelect={() => void setLanguage(lang)}
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
    </>
  );
}

/** Bilibili account summary + switch button shared by both menus. */
function BilibiliAccountPanel({
  status,
  onOpenDialog
}: {
  status: BilibiliAuthStatus | null;
  onOpenDialog: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="px-3 py-3 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
          status?.authenticated ? 'bg-green-500' : 'bg-muted-foreground/40'
        }`}>
          {status?.authenticated
            ? (status.account?.uname?.[0]?.toUpperCase() ?? 'B')
            : 'B'}
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-xs text-muted-foreground">
            {status?.authenticated ? t("bilibiliAuth.loggedIn") : t("bilibiliAuth.notLoggedIn")}
          </span>
          <span className="text-sm font-medium text-foreground break-all">
            {status?.authenticated
              ? (status.account?.uname || '-')
              : '-'}
          </span>
        </div>
      </div>
      <Button
        onClick={onOpenDialog}
        size="sm"
        variant={status?.authenticated ? 'outline' : 'default'}
        className="cursor-pointer w-full"
      >
        {status?.authenticated ? t("bilibiliAuth.switchAccount") : t("bilibiliAuth.login")}
      </Button>
    </div>
  );
}

export function AppHeader({
  diskUsage,
  bilibiliButtonVisible,
  bilibiliAuthStatus,
  onRefreshBilibiliStatus,
  onOpenBilibiliDialog,
  onOpenAbout,
  onLogout,
  showLogout,
  showServerOutdatedBadge
}: AppHeaderProps) {
  const { t } = useTranslation();
  const { theme, resolvedTheme } = useTheme();

  const ThemeTriggerIcon =
    theme === "dark"
      ? MoonIcon
      : theme === "light"
      ? SunIcon
      : resolvedTheme === "dark"
      ? MoonIcon
      : SunIcon;

  return (
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
                <LanguageMenuItems />
              </DropdownMenuContent>
            </DropdownMenu>

            {bilibiliButtonVisible && (
              <DropdownMenu onOpenChange={(open) => {
                if (open) {
                  void onRefreshBilibiliStatus();
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
                  <BilibiliAccountPanel
                    status={bilibiliAuthStatus}
                    onOpenDialog={onOpenBilibiliDialog}
                  />
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            <Button
              variant="ghost"
              size="sm"
              className="relative shrink-0 text-card-foreground hover:text-primary rounded-md p-1 hover:bg-secondary/10 dark:hover:bg-secondary/10 hover:scale-[1.02]"
              aria-label={t("about.title")}
              onClick={onOpenAbout}
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
                <ThemeMenuItems />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex sm:hidden items-center gap-2">
            <DropdownMenu onOpenChange={(open) => {
              if (open && bilibiliButtonVisible) {
                void onRefreshBilibiliStatus();
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
                    <BilibiliAccountPanel
                      status={bilibiliAuthStatus}
                      onOpenDialog={onOpenBilibiliDialog}
                    />
                    <DropdownMenuSeparator />
                  </>
                )}
                <ThemeMenuItems />
                <DropdownMenuSeparator />
                <LanguageMenuItems />
                <DropdownMenuSeparator />
                <DropdownMenuLabel>{t("about.section")}</DropdownMenuLabel>
                <DropdownMenuItem
                  onSelect={onOpenAbout}
                  className="gap-2 cursor-pointer text-muted-foreground"
                >
                  <InfoIcon size={14} className="shrink-0" />
                  {t("about.menuItem")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {showLogout ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onLogout}
              className="shrink-0 text-card-foreground hover:text-destructive rounded-md p-1 hover:bg-secondary/10 dark:hover:bg-secondary/10 hover:scale-[1.02]"
              aria-label={t("actions.logout")}
            >
              <SignOutIcon size={20} />
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}