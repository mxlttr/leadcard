"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { UpdatesResponse } from "@/lib/types";

async function fetchPage(
  id: string,
  cursor?: string | null,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({ tournamentId: id });
  if (cursor) params.set("cursor", cursor);
  const response = await fetch(`/api/updates?${params}`, {
    cache: "no-store",
    signal,
  });
  if (!response.ok)
    throw new Error(
      response.status === 409 ? "archive-rebuilt" : "Could not load updates",
    );
  return response.json() as Promise<UpdatesResponse>;
}

function mergeUpdates(newer: UpdatesResponse, older: UpdatesResponse) {
  const seen = new Set<string>();
  return [...newer.updates, ...older.updates].filter((update) => {
    if (seen.has(update.id)) return false;
    seen.add(update.id);
    return true;
  });
}

export function useUpdateArchive(
  tournamentId: string,
  locale: string,
  refresh: boolean,
) {
  const client = useQueryClient();
  const key = ["updates", locale, tournamentId];
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);
  const query = useQuery({
    queryKey: key,
    enabled: Boolean(tournamentId),
    refetchInterval: refresh ? 120_000 : false,
    queryFn: async ({ signal }) => {
      const first = await fetchPage(tournamentId, null, signal);
      const previous = client.getQueryData<UpdatesResponse>(key);
      if (
        first.archiveVersion === "mock" ||
        !previous?.updates.length ||
        previous.archiveVersion !== first.archiveVersion
      )
        return first;
      const head = previous.updates[0].id;
      let page = first;
      let incoming = first.updates;
      // Catch up across multiple pages if more than 50 events arrived since the
      // last request. This avoids gaps between the live head and loaded history.
      while (
        !incoming.some((update) => update.id === head) &&
        page.nextCursor
      ) {
        page = await fetchPage(tournamentId, page.nextCursor, signal);
        incoming = [...incoming, ...page.updates];
      }
      const existing = client.getQueryData<UpdatesResponse>(key) ?? previous;
      return {
        ...first,
        updates: mergeUpdates({ ...first, updates: incoming }, existing),
        nextCursor: existing.nextCursor,
      };
    },
  });

  const loadOlder = async () => {
    const current = client.getQueryData<UpdatesResponse>(key);
    if (!current?.nextCursor || loadingId === tournamentId) return;
    setLoadingId(tournamentId);
    setErrorId(null);
    try {
      const page = await fetchPage(tournamentId, current.nextCursor);
      client.setQueryData<UpdatesResponse>(key, (existing) => {
        if (!existing || existing.archiveVersion !== page.archiveVersion)
          return existing;
        return {
          ...existing,
          updates: mergeUpdates(existing, page),
          nextCursor: page.nextCursor,
        };
      });
    } catch (error) {
      if (error instanceof Error && error.message === "archive-rebuilt") {
        await client.invalidateQueries({ queryKey: key });
      } else setErrorId(tournamentId);
    } finally {
      setLoadingId((current) => (current === tournamentId ? null : current));
    }
  };

  return {
    ...query,
    loadOlder,
    loadingOlder: loadingId === tournamentId,
    olderError: errorId === tournamentId,
  };
}
