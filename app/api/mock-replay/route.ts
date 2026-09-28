import { type NextRequest, NextResponse } from "next/server";

import { controlMockReplay } from "@/lib/server/live-store";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    tournamentId?: string;
    action?: "play" | "pause" | "step";
    index?: number;
  };

  if (!body.tournamentId || !body.action) {
    return NextResponse.json(
      { error: "Missing replay command" },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(
      await controlMockReplay(body.tournamentId, body.action, body.index),
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Replay command failed",
      },
      { status: 400 },
    );
  }
}
