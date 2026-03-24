"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function DivisionTabs({
  divisions,
  selectedDivision,
  onChange,
}: {
  divisions: string[];
  selectedDivision: string;
  onChange: (value: string) => void;
}) {
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
              {division}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
    </Tabs>
  );
}
