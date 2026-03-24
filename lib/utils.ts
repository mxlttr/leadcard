import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatScore(scoreToPar: number) {
  if (scoreToPar === 0) {
    return "E";
  }

  return scoreToPar > 0 ? `+${scoreToPar}` : `${scoreToPar}`;
}

export function scoreTone(scoreToPar: number) {
  if (scoreToPar < 0) {
    return "text-primary";
  }

  if (scoreToPar > 0) {
    return "text-negative";
  }

  return "text-foreground";
}

export function holeToLabel(thru: number | "F") {
  return thru === "F" ? "Finished" : `Through ${thru}`;
}

export function timestampLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
