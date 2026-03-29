import { type NextRequest, NextResponse } from "next/server";

import {
  getLeaderboardResponse,
  getResolvedTournamentId,
} from "@/lib/server/live-store";

export async function GET(request: NextRequest) {
  const division = request.nextUrl.searchParams.get("division") ?? "";
  const tournamentId = await getResolvedTournamentId(
    request.nextUrl.searchParams.get("tournamentId"),
  );
  return NextResponse.json(
    await getLeaderboardResponse(tournamentId, division),
  );
}
