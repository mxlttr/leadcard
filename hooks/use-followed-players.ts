"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "leadcard:followedPlayers";

export function useFollowedPlayers() {
  const [followedPlayers, setFollowedPlayers] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);

    if (stored) {
      setFollowedPlayers(JSON.parse(stored) as string[]);
    }

    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(followedPlayers));
  }, [followedPlayers, hydrated]);

  function togglePlayer(playerId: string) {
    setFollowedPlayers((current) =>
      current.includes(playerId)
        ? current.filter((id) => id !== playerId)
        : [...current, playerId],
    );
  }

  return {
    followedPlayers,
    hydrated,
    isFollowed: (playerId: string) => followedPlayers.includes(playerId),
    togglePlayer,
  };
}
