import { LeaderboardCard } from "@/components/live/leaderboard-card";
import type { LeaderboardPlayer } from "@/lib/types";

export function BattleGroup({
  title,
  players,
  divisionPlayers,
  showDivision,
  isFollowed,
  onFollowToggle,
  onPlayerSelect,
}: {
  title: string;
  players: LeaderboardPlayer[];
  divisionPlayers: LeaderboardPlayer[];
  showDivision?: boolean;
  isFollowed: (playerId: string) => boolean;
  onFollowToggle: (playerId: string) => void;
  onPlayerSelect: (player: LeaderboardPlayer) => void;
}) {
  if (players.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3">
      <div className="px-1">
        <h3 className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-muted">
          {title}
        </h3>
      </div>
      <div className="space-y-3">
        {players.map((player) => (
          <LeaderboardCard
            key={player.playerId}
            player={player}
            divisionPlayers={divisionPlayers}
            showDivision={showDivision}
            followed={isFollowed(player.playerId)}
            onFollowToggle={() => onFollowToggle(player.playerId)}
            onSelect={() => onPlayerSelect(player)}
          />
        ))}
      </div>
    </section>
  );
}
