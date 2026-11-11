import { NextResponse } from "next/server";
import { getHealth } from "@/lib/server/health";

export const dynamic = "force-dynamic";

export function GET() {
  const health = getHealth();
  return NextResponse.json(health, {
    status: health.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
