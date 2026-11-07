"use client";

import { Switch } from "@ui/switch";
import { useTranslations } from "next-intl";
import { useState } from "react";
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

  async function flip(next: boolean) {
    setOn(next);
    setFailed(false);
    let saved = false;
    try {
      saved = (await save(next)).ok;
    } catch {
      saved = false;
    }
    if (!saved) {
      setOn(!next);
      setFailed(true);
    }
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
