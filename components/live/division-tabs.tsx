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
  const { locale } = useI18n();

  return (
    <Tabs value={selectedDivision} onValueChange={onChange}>
      <div className="-mx-1 overflow-x-auto pb-1">
        <TabsList className="h-auto w-max min-w-full gap-1 whitespace-nowrap">
          {divisions.map((division) => (
            <TabsTrigger
              key={division}
              value={division}
              className="min-w-max flex-[1_0_max-content] px-4"
            >
              {translateDivisionLabel(division, locale)}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
    </Tabs>
  );
}
