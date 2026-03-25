"use client";

import { Star } from "lucide-react";

import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function FollowToggle({
  active,
  onToggle,
  className,
}: {
  active: boolean;
  onToggle: () => void;
  className?: string;
}) {
  const { t } = useI18n();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={onToggle}
      className={cn("h-9 w-9 rounded-full border border-border", className)}
      aria-label={active ? t("player.unfollow") : t("player.follow")}
    >
      <Star
        className={cn(
          "h-4 w-4",
          active ? "fill-primary text-primary" : "text-muted",
        )}
      />
    </Button>
  );
}
