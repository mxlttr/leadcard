"use client";

import { Download, Share } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let pendingInstallPrompt: InstallPromptEvent | null = null;

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    pendingInstallPrompt = event as InstallPromptEvent;
    window.dispatchEvent(new Event("leadcard-install-available"));
  });
  window.addEventListener("appinstalled", () => {
    pendingInstallPrompt = null;
  });
}

const copy = {
  en: {
    install: "Add Leadcard to Home Screen",
    ios: "In Safari, tap Share, then Add to Home Screen.",
    installed: "Leadcard is already installed on this device.",
    dismiss: "Got it",
  },
  de: {
    install: "Leadcard zum Home-Bildschirm hinzufügen",
    ios: "In Safari auf „Teilen“ und dann „Zum Home-Bildschirm“ tippen.",
    installed: "Leadcard ist auf diesem Gerät bereits installiert.",
    dismiss: "Verstanden",
  },
} as const;

export function InstallAppOption({ locale }: { locale: "en" | "de" }) {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(
    null,
  );
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const strings = copy[locale];

  useEffect(() => {
    const onInstallAvailable = () => setPromptEvent(pendingInstallPrompt);
    const onAppInstalled = () => {
      pendingInstallPrompt = null;
      setPromptEvent(null);
      setIsInstalled(true);
    };

    window.addEventListener("leadcard-install-available", onInstallAvailable);
    window.addEventListener("appinstalled", onAppInstalled);
    if (pendingInstallPrompt) setPromptEvent(pendingInstallPrompt);

    const isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in window.navigator &&
        Boolean(
          (window.navigator as Navigator & { standalone?: boolean }).standalone,
        ));
    if (isStandalone) {
      setIsInstalled(true);
    } else if (isIos) {
      setShowIosHelp(true);
    }

    return () => {
      window.removeEventListener(
        "leadcard-install-available",
        onInstallAvailable,
      );
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  if (isInstalled) {
    return <p className="text-sm text-muted">{strings.installed}</p>;
  }

  if (showIosHelp) {
    return (
      <div className="grid gap-3 rounded-2xl border border-border bg-surface p-4">
        <p className="flex gap-2 text-sm text-foreground">
          <Share className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {strings.ios}
        </p>
        <Button
          type="button"
          variant="ghost"
          className="w-fit border border-border"
          onClick={() => setShowIosHelp(false)}
        >
          {strings.dismiss}
        </Button>
      </div>
    );
  }

  if (!promptEvent) return null;

  return (
    <Button
      type="button"
      variant="ghost"
      className="justify-start border border-border"
      onClick={async () => {
        await promptEvent.prompt();
        await promptEvent.userChoice;
        setPromptEvent(null);
      }}
    >
      <Download className="mr-2 h-4 w-4" />
      {strings.install}
    </Button>
  );
}
