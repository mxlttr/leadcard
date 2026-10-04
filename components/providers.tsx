"use client";

import * as Sentry from "@sentry/nextjs";
import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import { ThemeProvider } from "@/components/theme-provider";

const reportedQueryErrors = new Map<string, number>();
const QUERY_ERROR_REPORT_INTERVAL_MS = 5 * 60_000;

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: (error, query) => {
            const key = query.queryHash;
            const now = Date.now();
            const lastReportedAt = reportedQueryErrors.get(key);
            if (
              lastReportedAt !== undefined &&
              now - lastReportedAt < QUERY_ERROR_REPORT_INTERVAL_MS
            ) {
              return;
            }
            reportedQueryErrors.set(key, now);
            Sentry.withScope((scope) => {
              scope.setTag("error.source", "react-query");
              scope.setContext("query", { key: query.queryKey });
              Sentry.captureException(error);
            });
          },
        }),
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ThemeProvider>
  );
}
