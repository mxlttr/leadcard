"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "leadcard:followedClubs";

export function useFollowedClubs() {
  const [followedClubs, setFollowedClubs] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setFollowedClubs(JSON.parse(stored) as string[]);
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(followedClubs));
    }
  }, [followedClubs, hydrated]);

  function toggleClub(club: string) {
    setFollowedClubs((current) =>
      current.includes(club)
        ? current.filter((item) => item !== club)
        : [...current, club],
    );
  }

  return {
    followedClubs,
    hydrated,
    isFollowed: (club: string) => followedClubs.includes(club),
    toggleClub,
  };
}
