import { NextResponse } from "next/server";
import { getArchive } from "@/lib/server/archive";

export const dynamic = "force-dynamic";

export function GET() {
  try {
    if (process.env.LEADCARD_FORCE_MOCK_DATA !== "true")
      getArchive().db.prepare("SELECT 1").get();
    return NextResponse.json({
      ok: true,
      collector: globalThis.leadcardCollector?.status() ?? null,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Archive unavailable" },
      { status: 503 },
    );
  }
}
