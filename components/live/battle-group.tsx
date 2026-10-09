import { useI18n } from "@/components/i18n-provider";
import { LeaderboardCard } from "@/components/live/leaderboard-card";
import type { LeaderboardPlayer } from "@/lib/types";

export function BattleGroup({
  id,
  title,
  players,
  divisionPlayers,
  showDivision,
  overallRank,
  upcoming,
  expandedPlayerId,
  isFollowed,
  onFollowToggle,
}: {
  id: string;
  title: string;
  players: LeaderboardPlayer[];
  divisionPlayers: LeaderboardPlayer[];
  showDivision?: boolean;
  overallRank?: boolean;
  upcoming?: boolean;
  expandedPlayerId?: string | null;
  isFollowed: (playerId: string) => boolean;
  onFollowToggle: (playerId: string) => void;
}) {
  const { t } = useI18n();

  if (players.length === 0) {
    return null;
  }

  return (
    <section id={id} className="space-y-3">
      <div className="px-1">
        <h3 className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-muted">
          {title}
        </h3>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <table className="w-full table-fixed border-collapse">
          <thead>
            <tr className="border-b border-border text-[10px] font-medium uppercase tracking-wide text-muted">
              {!upcoming ? (
                <th className="w-10 px-1 py-2 text-center sm:w-12 sm:px-2">
                  {t("board.columns.rank")}
                </th>
              ) : null}
              <th className="px-1 py-2 text-left sm:px-2">
                {t("board.columns.player")}
              </th>
              {!upcoming ? (
                <>
                  <th className="w-12 px-1 py-2 text-center sm:w-14">
                    {t("board.columns.total")}
                  </th>
                  <th className="w-10 px-1 py-2 text-center sm:w-12">
                    {t("board.columns.thru")}
                  </th>
                  <th className="w-11 px-1 py-2 text-center sm:w-12">
                    {t("board.columns.round")}
                  </th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {players.map((player) => (
              <LeaderboardCard
                key={player.playerId}
                player={player}
                divisionPlayers={divisionPlayers}
                showDivision={showDivision}
                overallRank={overallRank}
                upcoming={upcoming}
                expandedPlayerId={expandedPlayerId}
                followed={isFollowed(player.playerId)}
                onFollowToggle={() => onFollowToggle(player.playerId)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
