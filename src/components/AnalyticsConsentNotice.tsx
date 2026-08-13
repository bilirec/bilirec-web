import { useEffect, useState } from "react";
import { InfoIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { AnalyticsConsent } from "@/lib/analytics";

interface AnalyticsConsentNoticeProps {
  onConsentChange: (consent: AnalyticsConsent) => void;
}

export function AnalyticsConsentNotice({
  onConsentChange
}: AnalyticsConsentNoticeProps) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setVisible(true), 1000);
    return () => window.clearTimeout(id);
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <Card
      role="region"
      aria-labelledby="analytics-consent-title"
      className="fixed inset-x-2 top-2 z-50 animate-in fade-in-0 slide-in-from-top-4 duration-300 gap-3 border-primary/20 p-4 shadow-[0_12px_40px_rgba(15,23,42,0.18)]! lg:inset-x-auto lg:top-auto lg:right-4 lg:bottom-4 lg:z-30 lg:w-[min(24rem,calc(100vw-2rem))] lg:slide-in-from-bottom-4 lg:p-5"
    >
      <CardHeader className="gap-1 p-0">
        <div className="flex items-start gap-3">
          <InfoIcon
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-primary"
            size={18}
            weight="duotone"
          />
          <div className="min-w-0">
            <CardTitle
              id="analytics-consent-title"
              className="text-sm leading-snug"
            >
              {t("analytics.title")}
            </CardTitle>
            <CardDescription className="mt-1 text-xs leading-relaxed">
              {t("analytics.description")}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardFooter className="justify-end gap-2 p-0">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onConsentChange("denied")}
        >
          {t("analytics.decline")}
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => onConsentChange("granted")}
        >
          {t("analytics.accept")}
        </Button>
      </CardFooter>
    </Card>
  );
}
