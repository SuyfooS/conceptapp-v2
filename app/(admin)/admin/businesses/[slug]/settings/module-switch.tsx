"use client";

import { Switch } from "@ui/switch";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import type { SettingsResult } from "@/app/(app)/manage/settings-types";

/**
 * Switching a module on can also be refused because its tab would not fit in
 * the tab bar.
 */
export type ModuleSwitchResult =
  | SettingsResult
  | { ok: false; failure: "noRoom" };

/** Whether a module is on for this business, which only the team decides. */
export function ModuleSwitch({
  label,
  enabled,
  save,
}: {
  label: string;
  enabled: boolean;
  save: (enabled: boolean) => Promise<ModuleSwitchResult>;
}) {
  const t = useTranslations("admin.settings");
  const [on, setOn] = useState(enabled);
  const [failed, setFailed] = useState<"switchFailed" | "noRoom" | null>(null);
  const stored = useRef(enabled);
  const latest = useRef(0);

  async function flip(next: boolean) {
    latest.current += 1;
    const mine = latest.current;
    setOn(next);
    setFailed(null);
    let result: ModuleSwitchResult;
    try {
      result = await save(next);
    } catch {
      result = { ok: false, failure: "failed" };
    }
    if (result.ok) stored.current = next;
    // A later flip has the last word.
    if (mine !== latest.current) return;
    setOn(stored.current);
    setFailed(
      result.ok
        ? null
        : result.failure === "noRoom"
          ? "noRoom"
          : "switchFailed",
    );
  }

  return (
    <span className="flex items-center gap-2">
      {failed ? (
        <span role="alert" className="font-medium text-danger text-sm">
          {t(failed)}
        </span>
      ) : null}
      <Switch aria-label={label} checked={on} onChange={flip} />
    </span>
  );
}
