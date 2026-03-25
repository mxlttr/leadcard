import type { Metadata } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";

import "./globals.css";
import { Providers } from "@/components/providers";

const manrope = localFont({
  src: [
    {
      path: "./fonts/Manrope-Regular.ttf",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/Manrope-Medium.ttf",
      weight: "500",
      style: "normal",
    },
  ],
  variable: "--font-manrope",
});

const spaceGrotesk = localFont({
  src: [
    {
      path: "./fonts/SpaceGrotesk-SemiBold.ttf",
      weight: "600",
      style: "normal",
    },
    {
      path: "./fonts/SpaceGrotesk-Bold.ttf",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-space-grotesk",
});

export const metadata: Metadata = {
  title: "Leadcard",
  description: "Mobile-first live leaderboard for disc golf tournaments.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html className="dark">
      <body
        className={`${manrope.variable} ${spaceGrotesk.variable} bg-background font-body text-foreground antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
