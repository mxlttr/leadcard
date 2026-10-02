import { NextResponse } from "next/server";

import { getClubsResponse } from "@/lib/server/live-store";

export async function GET() {
  return NextResponse.json(await getClubsResponse());
}
