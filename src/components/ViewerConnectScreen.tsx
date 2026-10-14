import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface ViewerConnectScreenProps {
  onRetry: () => void;
  isRetrying: boolean;
}

/** Build-time viewer mode: shown instead of the login view when the server is unreachable. */
export function ViewerConnectScreen({
  onRetry,
  isRetrying
}: ViewerConnectScreenProps) {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md p-6 bg-card text-card-foreground text-center space-y-4">
        <p className="text-sm text-muted-foreground">
          {t("viewerMode.connectFailed")}
        </p>
        <Button
          type="button"
          className="w-full"
          disabled={isRetrying}
          onClick={onRetry}
        >
          {isRetrying ? t("login.loading") : t("viewerMode.retry")}
        </Button>
      </Card>
    </div>
  );
}