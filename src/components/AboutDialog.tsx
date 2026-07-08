import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowsClockwiseIcon,
  BookOpenIcon,
  BugIcon,
  ChatsCircleIcon,
  InfoIcon,
  ScrollIcon,
  type Icon
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { apiClient, parseVersionError } from "@/lib/api";
import { getVersionCheckErrorMessage } from "@/lib/server-version";
import type { ServerVersionResult } from "@/lib/types";

const CHANGELOG_URL = "https://github.com/bilirec/bilirec/releases";
const DOCS_URL = "https://www.bilirec.org";
const ISSUES_URL = "https://github.com/bilirec/bilirec/issues";
const QQ_GROUP_URL = "https://qm.qq.com/q/oMTN3EsGBy";

interface AboutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  version: ServerVersionResult | null;
  onVersionChange: (version: ServerVersionResult) => void;
}

function InfoGridRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="text-muted-foreground dark:text-[#8FA3B0]">{label}</span>
      <span className="truncate text-right font-mono text-foreground dark:text-[#E8F2F8]">
        {value}
      </span>
    </>
  );
}

function QuickLink({
  href,
  icon: LinkIcon,
  label
}: {
  href: string;
  icon: Icon;
  label: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "flex flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-3 text-xs transition-colors",
        "border-border/60 bg-card/60 text-foreground hover:bg-accent/40",
        "dark:border-white/[0.08] dark:bg-[#0C151C] dark:text-[#D8E6EF] dark:hover:border-sky-400/20 dark:hover:bg-[#101D27]"
      )}
    >
      <LinkIcon
        size={18}
        className="text-[#26A9F1] dark:text-sky-400"
      />
      <span className="leading-tight">{label}</span>
    </a>
  );
}

export function AboutDialog({
  open,
  onOpenChange,
  version,
  onVersionChange
}: AboutDialogProps) {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  const loadCachedVersion = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await apiClient.getVersion();
      onVersionChange(result);
    } catch (error) {
      console.error("Failed to load server version:", error);
    } finally {
      setIsLoading(false);
    }
  }, [onVersionChange]);

  useEffect(() => {
    if (!open) {
      return;
    }
    void loadCachedVersion();
  }, [open, loadCachedVersion]);

  const handleCheckUpdate = async () => {
    setIsChecking(true);
    try {
      const result = await apiClient.checkVersion();
      onVersionChange(result);
      if (result.error) {
        toast.error(getVersionCheckErrorMessage(result, t));
      }
    } catch (error) {
      const parsed = parseVersionError(error);
      if (parsed) {
        onVersionChange(parsed);
        toast.error(getVersionCheckErrorMessage(parsed, t));
      } else {
        toast.error(t("serverUpdate.checkFailed"));
      }
    } finally {
      setIsChecking(false);
    }
  };

  const currentValue =
    isLoading && !version
      ? t("about.loading")
      : version?.current || t("about.noVersion");
  const latestValue =
    version?.checked && !version.error && version.latest
      ? version.latest
      : t("about.noVersion");
  const showStatus = version?.checked && !version.error;

  const quickLinks: { href: string; label: string; icon: Icon }[] = [
    { href: CHANGELOG_URL, label: t("about.linkChangelog"), icon: ScrollIcon },
    { href: DOCS_URL, label: t("about.linkDocs"), icon: BookOpenIcon },
    { href: ISSUES_URL, label: t("about.linkIssues"), icon: BugIcon },
    { href: QQ_GROUP_URL, label: t("about.linkCommunity"), icon: ChatsCircleIcon }
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "gap-4 overflow-hidden border-border/70 bg-card sm:max-w-sm",
          "dark:border-white/[0.08] dark:bg-[#09131A] dark:shadow-[0_24px_60px_rgba(0,0,0,0.55)]"
        )}
      >
        <div className="flex flex-col items-center gap-3 pt-1 text-center">
          <div
            className={cn(
              "flex h-[72px] w-[72px] items-center justify-center rounded-full",
              "bg-[#26A9F1]/12 text-[#26A9F1] ring-1 ring-[#26A9F1]/20",
              "dark:bg-gradient-to-br dark:from-sky-400/20 dark:to-cyan-500/10",
              "dark:text-sky-300 dark:ring-sky-400/25"
            )}
          >
            <InfoIcon size={36} weight="duotone" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-lg font-semibold leading-tight text-card-foreground">
              {t("about.title")}
            </h2>
            <p className="text-sm leading-snug text-muted-foreground dark:text-[#9CB0BE]">
              {t("about.desc")}
            </p>
          </div>
        </div>

        <div
          className={cn(
            "grid grid-cols-2 gap-x-4 gap-y-2 rounded-2xl border px-4 py-3 text-sm",
            "border-border/60 bg-muted/30",
            "dark:border-white/[0.08] dark:bg-[#0E1A22]"
          )}
        >
          <InfoGridRow
            label={t("about.currentVersion")}
            value={currentValue}
          />
          <InfoGridRow label={t("about.latestVersion")} value={latestValue} />
          {showStatus ? (
            <div className="col-span-2 flex items-center justify-between gap-3 border-t border-border/50 pt-2 dark:border-white/[0.06]">
              <span className="text-muted-foreground dark:text-[#8FA3B0]">
                {t("about.status")}
              </span>
              <Badge
                variant={version?.outdated ? "destructive" : "secondary"}
                className={cn(
                  "px-2.5 py-1 text-xs font-medium",
                  !version?.outdated &&
                    "dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300"
                )}
              >
                {version?.outdated
                  ? t("about.updateAvailable")
                  : t("about.upToDate")}
              </Badge>
            </div>
          ) : null}
        </div>

        <Button
          type="button"
          className="w-full"
          disabled={isChecking}
          onClick={() => void handleCheckUpdate()}
        >
          <ArrowsClockwiseIcon
            size={18}
            className={isChecking ? "animate-spin" : undefined}
          />
          {isChecking ? t("about.checking") : t("about.checkUpdate")}
        </Button>

        <div className="grid grid-cols-2 gap-2">
          {quickLinks.map((link) => (
            <QuickLink
              key={link.href}
              href={link.href}
              icon={link.icon}
              label={link.label}
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
