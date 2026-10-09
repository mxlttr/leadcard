import { useI18n } from "@/components/i18n-provider";
import { LeaderboardCard } from "@/components/live/leaderboard-card";
import type { LeaderboardPlayer } from "@/lib/types";

export function BattleGroup({
  id,
  title,
  players,
  divisionPlayers,
  showDivision,
  upcoming,
  isFollowed,
  onFollowToggle,
  onPlayerSelect,
}: {
  id: string;
  title: string;
  players: LeaderboardPlayer[];
  divisionPlayers: LeaderboardPlayer[];
  showDivision?: boolean;
  upcoming?: boolean;
  isFollowed: (playerId: string) => boolean;
  onFollowToggle: (playerId: string) => void;
  onPlayerSelect: (player: LeaderboardPlayer) => void;
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
                <th className="w-12 px-2 py-2 text-center">
                  {t("board.columns.rank")}
                </th>
              ) : null}
              <th className="px-2 py-2 text-left">
                {t("board.columns.player")}
              </th>
              {!upcoming ? (
                <>
                  <th className="w-14 px-1 py-2 text-center">
                    {t("board.columns.total")}
                  </th>
                  <th className="w-12 px-1 py-2 text-center">
                    {t("board.columns.thru")}
                  </th>
                  <th className="w-12 px-1 py-2 text-center">
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
                upcoming={upcoming}
                followed={isFollowed(player.playerId)}
                onFollowToggle={() => onFollowToggle(player.playerId)}
                onSelect={() => onPlayerSelect(player)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
