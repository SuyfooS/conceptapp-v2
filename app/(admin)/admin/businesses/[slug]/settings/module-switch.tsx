"use client";

import { Switch } from "@ui/switch";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import type { SettingsResult } from "@/app/(app)/manage/settings-types";

/** Whether a module is on for this business, which only the team decides. */
export function ModuleSwitch({
  label,
  enabled,
  save,
}: {
  label: string;
  enabled: boolean;
  save: (enabled: boolean) => Promise<SettingsResult>;
}) {
  const t = useTranslations("admin.settings");
  const [on, setOn] = useState(enabled);
  const [failed, setFailed] = useState(false);
  const stored = useRef(enabled);
  const latest = useRef(0);

  async function flip(next: boolean) {
    latest.current += 1;
    const mine = latest.current;
    setOn(next);
    setFailed(false);
    let saved = false;
    try {
      saved = (await save(next)).ok;
    } catch {
      saved = false;
    }
    if (saved) stored.current = next;
    // A later flip has the last word.
    if (mine !== latest.current) return;
    setOn(stored.current);
    setFailed(!saved);
  }

  return (
    <span className="flex items-center gap-2">
      {failed ? (
        <span role="alert" className="font-medium text-danger text-sm">
          {t("switchFailed")}
        </span>
      ) : null}
      <Switch aria-label={label} checked={on} onChange={flip} />
    </span>
  );
}
