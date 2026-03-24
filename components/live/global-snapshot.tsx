import { ScoreDisplay } from "@/components/live/score-display";
import { Card, CardContent } from "@/components/ui/card";
import type { LiveResponse } from "@/lib/types";
import { formatScore, timestampLabel } from "@/lib/utils";

export function GlobalSnapshot({ data }: { data: LiveResponse }) {
  const overallLeader = data.leaders[0];
  const noLiveData = !data.hasLiveData;

  return (
    <Card className="border-border bg-surface shadow-none">
      <CardContent className="space-y-5 p-5">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted">
            Global snapshot
          </p>
          <h2 className="mt-2 font-display text-2xl font-semibold [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
            {data.tournament.name}
          </h2>
          <p className="mt-2 truncate text-sm text-muted">{data.tournament.course}</p>
          <p className="mt-1 text-sm text-muted [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
            {noLiveData
              ? `${data.tournament.roundLabel} · Live scoring is not available yet`
              : `${data.tournament.roundLabel} · Latest update ${timestampLabel(data.generatedAt)}`}
          </p>
        </div>

        {noLiveData ? (
          <div className="rounded-[20px] border border-border bg-background p-4 text-sm text-muted">
            {data.tournament.status === "upcoming"
              ? "This tournament is upcoming. Leadcard will switch to live standings once the organizer publishes livescoring."
              : "Live scoring is not available for this tournament right now."}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            {data.leaders.map((leader, index) => (
              <div
                key={leader.playerId}
                className="rounded-[20px] border border-border bg-background p-4"
              >
                <p className="text-xs uppercase tracking-[0.18em] text-muted">Overall #{index + 1}</p>
                <p className="mt-3 truncate font-body text-lg font-medium">{leader.name}</p>
                <p className="mt-1 truncate text-sm text-muted">{leader.division}</p>
                <ScoreDisplay scoreToPar={leader.scoreToPar} className="mt-4 block text-2xl" />
              </div>
            ))}
          </div>
        )}

        <div className="grid gap-3">
          {data.divisionLeaders.map(({ division, leader }) => {
            const gap = overallLeader ? leader.scoreToPar - overallLeader.scoreToPar : 0;

            return (
              <div
                key={division}
                className="flex items-center justify-between rounded-[18px] border border-border bg-background px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs uppercase tracking-[0.18em] text-muted">{division} leader</p>
                  <p className="mt-1 truncate font-medium">{leader.name}</p>
                </div>
                <div className="ml-3 shrink-0 text-right">
                  <ScoreDisplay scoreToPar={leader.scoreToPar} className="text-2xl" />
                  <p className="mt-1 text-xs text-muted">
                    {gap === 0 ? "Tied overall" : `${formatScore(gap)} to overall lead`}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
