import { NextResponse } from "next/server";

import { getTournamentCatalogWithArchive } from "@/lib/server/live-store";

export async function GET() {
  return NextResponse.json({
    tournaments: await getTournamentCatalogWithArchive(),
  });
}
