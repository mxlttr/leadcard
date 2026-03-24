import { LiveLeaderboard } from "@/components/live/live-leaderboard";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-4 py-5 sm:px-6 sm:py-8">
        <LiveLeaderboard />
      </div>
    </main>
  );
}
