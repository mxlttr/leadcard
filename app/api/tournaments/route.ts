import { NextResponse } from "next/server";

import { getTournamentCatalog } from "@/lib/server/tournament-source";

export async function GET() {
  return NextResponse.json({ tournaments: await getTournamentCatalog() });
}
