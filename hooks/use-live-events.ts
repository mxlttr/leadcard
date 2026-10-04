"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

export function useLiveEvents(tournamentId: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!tournamentId || typeof EventSource === "undefined") return;

    const source = new EventSource(
      `/api/live-events?tournamentId=${encodeURIComponent(tournamentId)}`,
    );
    const refresh = () => {
      void queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey.includes(tournamentId) ||
          query.queryKey[0] === "live" ||
          query.queryKey[0] === "board-live",
      });
    };
    source.addEventListener("update", refresh);

    return () => source.close();
  }, [queryClient, tournamentId]);
}
