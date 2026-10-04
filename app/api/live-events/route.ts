import type { NextRequest } from "next/server";
import {
  getResolvedTournamentId,
  subscribeToLiveUpdates,
} from "@/lib/server/live-store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const tournamentId = await getResolvedTournamentId(
    request.nextUrl.searchParams.get("tournamentId"),
  );
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const cleanup = () => {
    unsubscribe?.();
    unsubscribe = undefined;
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = undefined;
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: {}\n\n`));
      };

      send("connected");
      void subscribeToLiveUpdates(tournamentId, () => send("update"))
        .then((stop) => {
          if (request.signal.aborted) {
            stop();
            return;
          }
          unsubscribe = stop;
          heartbeat = setInterval(() => send("heartbeat"), 20_000);
          heartbeat.unref?.();
        })
        .catch(() => controller.close());
    },
    cancel() {
      cleanup();
    },
  });

  request.signal.addEventListener("abort", cleanup, { once: true });
  if (request.signal.aborted) cleanup();

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
