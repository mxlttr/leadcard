import { NextResponse } from "next/server";

import {
  getClubsResponse,
  getClubTournamentResponse,
} from "@/lib/server/live-store";

export async function GET(request: Request) {
  const tournamentId = new URL(request.url).searchParams.get("tournamentId");

  if (tournamentId) {
    const response = await getClubTournamentResponse(tournamentId);
    if (!response) {
      return NextResponse.json(
        { error: "Unknown tournament" },
        { status: 404 },
      );
    }
    return NextResponse.json(response);
  }

  return NextResponse.json(await getClubsResponse());
}
