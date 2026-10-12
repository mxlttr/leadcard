import { type NextRequest, NextResponse } from "next/server";
import {
  ArchiveVersionChanged,
  InvalidArchiveCursor,
} from "@/lib/server/archive";
import {
  getResolvedTournamentId,
  getUpdatesResponse,
} from "@/lib/server/live-store";

export async function GET(request: NextRequest) {
  const tournamentId = await getResolvedTournamentId(
    request.nextUrl.searchParams.get("tournamentId"),
  );
  try {
    return NextResponse.json(
      await getUpdatesResponse(
        tournamentId,
        request.nextUrl.searchParams.get("cursor"),
      ),
    );
  } catch (error) {
    if (
      error instanceof InvalidArchiveCursor ||
      error instanceof ArchiveVersionChanged
    ) {
      return NextResponse.json(
        { error: error.message },
        { status: error instanceof ArchiveVersionChanged ? 409 : 400 },
      );
    }
    throw error;
  }
}
