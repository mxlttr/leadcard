import { NextRequest, NextResponse } from "next/server";

import {
  getLiveResponse,
  getResolvedTournamentId,
} from "@/lib/server/live-store";

export async function GET(request: NextRequest) {
  const tournamentId = await getResolvedTournamentId(
    request.nextUrl.searchParams.get("tournamentId"),
  );
  return NextResponse.json(await getLiveResponse(tournamentId));
}
