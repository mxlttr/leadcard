import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3"],
  experimental: {
    agentUpgrade: "security",
  },
};

export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  tunnelRoute: "/sentry-tunnel",
});
