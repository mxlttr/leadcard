"use client";

import { useI18n } from "@/components/i18n-provider";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { translateDivisionLabel } from "@/lib/i18n/divisions";

export function DivisionTabs({
  divisions,
  selectedDivision,
  onChange,
}: {
  divisions: string[];
  selectedDivision: string;
  onChange: (value: string) => void;
}) {
  const { locale, t } = useI18n();

  return (
    <Tabs value={selectedDivision} onValueChange={onChange}>
      <div className="-mx-1 overflow-hidden rounded-full border border-border bg-surface/80">
        <div className="overflow-x-auto">
          <TabsList className="h-auto min-w-full w-max gap-1 whitespace-nowrap rounded-none border-0 bg-transparent">
            {divisions.map((division) => (
              <TabsTrigger
                key={division}
                value={division}
                className="min-w-max flex-[1_0_max-content] px-4"
              >
                {division === "__all"
                  ? t("leaderboard.allDivisions")
                  : translateDivisionLabel(division, locale)}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </div>
    </Tabs>
  );
}
