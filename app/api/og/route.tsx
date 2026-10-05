import { ImageResponse } from "next/og";

import { type AppLocale, getDictionary, isValidLocale } from "@/lib/i18n";
import { getTournamentCatalog } from "@/lib/server/tournament-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requestedLocale = searchParams.get("locale") ?? "en";
  const locale: AppLocale = isValidLocale(requestedLocale)
    ? requestedLocale
    : "en";
  const dictionary = getDictionary(locale);
  const tournamentId = searchParams.get("tournamentId");
  let tournament: { name: string; course: string } | undefined;

  if (tournamentId) {
    try {
      tournament = (await getTournamentCatalog()).find(
        (item) => item.id === tournamentId,
      );
    } catch {
      tournament = undefined;
    }
  }

  const title = tournament?.name ?? "Leadcard";
  const subtitle = tournament?.course ?? dictionary.meta.description;
  const context = tournament
    ? dictionary.meta.tournamentContext
    : dictionary.app.title.toLocaleUpperCase(locale);

  return new ImageResponse(
    <div
      style={{
        alignItems: "stretch",
        background: "#101820",
        color: "#f6f7f2",
        display: "flex",
        flexDirection: "column",
        fontFamily: "Arial, sans-serif",
        height: "100%",
        justifyContent: "space-between",
        padding: "72px 80px",
        position: "relative",
        width: "100%",
      }}
    >
      <div
        style={{
          background: "#c6f36a",
          borderRadius: 999,
          height: 420,
          opacity: 0.12,
          position: "absolute",
          right: -70,
          top: -180,
          width: 420,
        }}
      />
      <div
        style={{
          alignItems: "center",
          color: "#c6f36a",
          display: "flex",
          fontSize: 28,
          fontWeight: 700,
          letterSpacing: 2,
        }}
      >
        <span
          style={{
            alignItems: "center",
            background: "#c6f36a",
            borderRadius: 14,
            color: "#101820",
            display: "flex",
            fontSize: 30,
            height: 54,
            justifyContent: "center",
            marginRight: 16,
            width: 54,
          }}
        >
          L
        </span>
        LEADCARD
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div
          style={{
            color: "#c6f36a",
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: 3,
          }}
        >
          {context}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: title.length > 54 ? 48 : 64,
            fontWeight: 700,
            letterSpacing: -1.5,
            lineHeight: 1.12,
            maxWidth: 1030,
          }}
        >
          {title}
        </div>
        <div style={{ color: "#b4c0bd", display: "flex", fontSize: 30 }}>
          {subtitle}
        </div>
      </div>
      <div style={{ color: "#b4c0bd", display: "flex", fontSize: 23 }}>
        {dictionary.app.tagline}
      </div>
    </div>,
    {
      height: 630,
      width: 1200,
    },
  );
}
