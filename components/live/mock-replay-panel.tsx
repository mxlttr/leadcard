"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { LiveResponse } from "@/lib/types";

export function MockReplayPanel({
  tournamentId,
  replay,
}: {
  tournamentId: string;
  replay: LiveResponse["mockReplay"];
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(replay?.index ?? 0);
  const lastSubmittedIndex = useRef<number | null>(null);
  const replayIndex = replay?.index;
  const replayCount = replay?.count;

  useEffect(() => {
    if (replayIndex === undefined) return;
    setSelectedIndex(replayIndex);
    lastSubmittedIndex.current = null;
  }, [replayIndex]);

  if (!replay) return null;

  async function command(action: "play" | "pause" | "step", index?: number) {
    setBusy(true);
    setError(false);
    try {
      const response = await fetch("/api/mock-replay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tournamentId, action, index }),
      });
      if (!response.ok) throw new Error("Could not control mock replay");
      await queryClient.invalidateQueries();
      return true;
    } catch {
      setError(true);
      return false;
    } finally {
      setBusy(false);
    }
  }

  function commitSliderValue(value: string) {
    const index = Number(value);
    setSelectedIndex(index);

    if (
      replayIndex === undefined ||
      index === replayIndex ||
      lastSubmittedIndex.current === index
    ) {
      return;
    }

    lastSubmittedIndex.current = index;
    void command("step", index).then((succeeded) => {
      if (!succeeded) lastSubmittedIndex.current = null;
    });
  }

  function step(direction: -1 | 1) {
    if (replayIndex === undefined || replayCount === undefined) return;
    const index = (replayIndex + direction + replayCount) % replayCount;
    void command("step", index);
  }

  return (
    <aside className="fixed bottom-4 right-4 z-[70] w-64 rounded-2xl border border-border bg-background/95 p-3 shadow-xl backdrop-blur sm:bottom-6 sm:right-6">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Mock replay
        </p>
        <span className="text-xs tabular-nums text-muted">
          {replay.index + 1} / {replay.count}
        </span>
      </div>
      {error ? (
        <p role="alert" className="mb-2 text-xs text-negative">
          Replay control failed.
        </p>
      ) : null}
      <input
        aria-label="Mock snapshot"
        className="mb-2 h-1.5 w-full cursor-pointer accent-primary"
        type="range"
        min={0}
        max={replay.count - 1}
        value={selectedIndex}
        disabled={busy}
        onChange={(event) => setSelectedIndex(Number(event.target.value))}
        onPointerUp={(event) => commitSliderValue(event.currentTarget.value)}
        onKeyUp={(event) => commitSliderValue(event.currentTarget.value)}
        onBlur={(event) => commitSliderValue(event.currentTarget.value)}
      />
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Previous snapshot"
          disabled={busy}
          onClick={() => step(-1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="accent"
          size="sm"
          className="flex-1 gap-2"
          disabled={busy}
          onClick={() => void command(replay.paused ? "play" : "pause")}
        >
          {replay.paused ? (
            <Play className="h-4 w-4" />
          ) : (
            <Pause className="h-4 w-4" />
          )}
          {replay.paused ? "Play refresh" : "Pause refresh"}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Next snapshot"
          disabled={busy}
          onClick={() => step(1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </aside>
  );
}
