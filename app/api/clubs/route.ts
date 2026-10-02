import { NextResponse } from "next/server";

import {
  getClubsResponse,
  getClubTournamentResponse,
} from "@/lib/server/live-store";

export async function GET(request: Request) {
  const tournamentId = new URL(request.url).searchParams.get("tournamentId");

  if (tournamentId) {
    return NextResponse.json(await getClubTournamentResponse(tournamentId));
  }

  return NextResponse.json(await getClubsResponse());
}
