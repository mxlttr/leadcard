import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as legacyGet } from "@/app/api/health/route";
import { GET as jsonGet } from "@/app/health.json/route";
import { getArchive } from "@/lib/server/archive";

vi.mock("@/lib/server/archive", () => ({ getArchive: vi.fn() }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

describe("health endpoints", () => {
  it("preserves successful polling and older snapshot dates on both URLs", async () => {
    vi.stubEnv("LEADCARD_FORCE_MOCK_DATA", "false");
    vi.stubEnv("LEADCARD_AUTO_REPORTS_ENABLED", "true");
    vi.mocked(getArchive).mockReturnValue({
      db: { prepare: () => ({ get: () => 1 }) },
      latestRatingsSnapshot: () => ({ capturedAt: "2026-10-28T09:38:14.195Z" }),
      lastRatingsPollAt: () => "2026-11-11T05:02:12.447Z",
      ratingsSnapshotCount: () => 4,
    } as unknown as ReturnType<typeof getArchive>);
    const response = jsonGet();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const payload = await response.json();
    expect(payload.ratings).toEqual({
      automaticReportsEnabled: true,
      lastSuccessfulPollAt: "2026-11-11T05:02:12.447Z",
      latestSnapshotAt: "2026-10-28T09:38:14.195Z",
      snapshotCount: 4,
    });
    expect(await legacyGet().json()).toEqual(payload);
  });

  it("returns a sanitized 503 when the archive cannot be read", async () => {
    vi.stubEnv("LEADCARD_FORCE_MOCK_DATA", "false");
    vi.mocked(getArchive).mockImplementation(() => {
      throw new Error("Private storage details");
    });
    for (const get of [jsonGet, legacyGet]) {
      const response = get();
      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toEqual({
        ok: false,
        error: "Archive unavailable",
      });
    }
  });

  it("does not open the production archive in mock mode", async () => {
    vi.stubEnv("LEADCARD_FORCE_MOCK_DATA", "true");
    expect((await jsonGet().json()).ratings.lastSuccessfulPollAt).toBeNull();
    expect(getArchive).not.toHaveBeenCalled();
  });
});
