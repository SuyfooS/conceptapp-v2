"use client";

import { Button } from "@ui/button";
import { LogIn } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { KitchenStation, type StationFacts } from "./kitchen-station";
import { fetchBackend } from "./station-backend";
import { TillStation } from "./till-station";

/**
 * The kitchen's screen or the till in the app, over the routes: told to
 * leave (stopped, no station any more, someone signed in), the page is read
 * again and says so. At the bottom, the quiet way to sign in, with the SMS
 * code to that person's own phone: the only way to an account here.
 */
export function StationApp({
  kind,
  facts,
  signInHref,
}: {
  kind: "prep" | "till";
  facts: StationFacts;
  signInHref: string;
}) {
  const t = useTranslations("station");
  const router = useRouter();
  const foot = (
    <Button asChild variant="ghost">
      <Link href={signInHref}>
        <LogIn aria-hidden="true" className="rtl:-scale-x-100" />
        {t("signIn")}
      </Link>
    </Button>
  );
  const leave = () => router.refresh();
  return kind === "prep" ? (
    <KitchenStation
      facts={facts}
      backend={fetchBackend}
      foot={foot}
      leave={leave}
    />
  ) : (
    <TillStation
      facts={facts}
      backend={fetchBackend}
      foot={foot}
      leave={leave}
    />
  );
}
