"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Reads the page again every `every` ms, for `during` ms after it shows: a
 * station stopped by mistake and taken back within its two minutes shows the
 * code again by itself, with nobody there to reload it.
 */
export function ReadAgain({
  every,
  during,
}: {
  every: number;
  during: number;
}) {
  const router = useRouter();
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - started > during) clearInterval(timer);
      else router.refresh();
    }, every);
    return () => clearInterval(timer);
  }, [every, during, router]);
  return null;
}
