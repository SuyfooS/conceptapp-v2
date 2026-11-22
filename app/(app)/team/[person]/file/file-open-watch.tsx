"use client";

import { idleLocksAt, touchDue } from "@domain/file-holders";
import { Button } from "@ui/button";
import { Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useEffectEvent, useState } from "react";
import type { HolderFileActions } from "./holder-file-types";

type Watched = Pick<HolderFileActions, "keepOpen" | "lock">;

/**
 * An open file, watched (profile H6a): as it opens it tells the server, and
 * activity on it (a press, a key) tells it again at most once a minute, so
 * its 15 minutes start again; 15 minutes with none, or coming back to it
 * after them, lock it (`lockFileAction`) and the page is drawn locked. The
 * step-up is the device's, so a file locked in one tab is locked in all:
 * another tab's next touch hears it is closed and draws itself again. The
 * twin, which keeps nothing, goes to its locked state instead
 * (`lockedHref`).
 */
export function FileOpenWatch({
  actions,
  lockedHref,
  children,
}: {
  actions: Watched;
  lockedHref?: string;
  children: ReactNode;
}) {
  const router = useRouter();

  const locked = useEffectEvent(() => {
    if (lockedHref) router.push(lockedHref);
    else router.refresh();
  });
  const lock = useEffectEvent(async () => {
    await actions.lock().catch(() => undefined);
    locked();
  });
  const keep = useEffectEvent(async () => {
    const answer = await actions.keepOpen().catch(() => ({ open: true }));
    if (!answer.open) locked();
  });

  useEffect(() => {
    let lastActivity = Date.now();
    let lastTouch: number | null = null;
    let done = false;
    let timer: number | undefined;

    const lockNow = () => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      void lock();
    };
    const arm = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(
        lockNow,
        Math.max(0, idleLocksAt(lastActivity) - Date.now()),
      );
    };
    const touch = (now: number) => {
      if (!touchDue(lastTouch, now)) return;
      lastTouch = now;
      void keep();
    };
    const active = () => {
      const now = Date.now();
      // Back after the 15 minutes: locked before anything else happens.
      if (now >= idleLocksAt(lastActivity)) {
        lockNow();
        return;
      }
      lastActivity = now;
      arm();
      touch(now);
    };
    const shown = () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() >= idleLocksAt(lastActivity)
      ) {
        lockNow();
      }
    };

    touch(lastActivity);
    arm();
    document.addEventListener("pointerdown", active);
    document.addEventListener("keydown", active);
    document.addEventListener("visibilitychange", shown);
    return () => {
      done = true;
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", active);
      document.removeEventListener("keydown", active);
      document.removeEventListener("visibilitychange", shown);
    };
  }, []);

  return children;
}

/** "נעילת התיק": the files close on this device at once. */
export function LockFileButton({
  lock,
  lockedHref,
}: {
  lock: HolderFileActions["lock"];
  lockedHref?: string;
}) {
  const t = useTranslations("app.team.file.lock");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant="secondary"
      loading={pending}
      onClick={async () => {
        setPending(true);
        await lock().catch(() => undefined);
        if (lockedHref) router.push(lockedHref);
        else router.refresh();
      }}
      className="self-start"
    >
      <Lock aria-hidden="true" />
      {t("action")}
    </Button>
  );
}
