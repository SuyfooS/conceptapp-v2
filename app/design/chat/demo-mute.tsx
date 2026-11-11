"use client";

import { Switch } from "@ui/switch";
import { BellOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";

/** The demo's "בלי התראות מהשיחה הזאת" (C3): it switches, and nothing is stored. */
export function DemoMute({ muted: first }: { muted: boolean }) {
  const t = useTranslations("app.chat.info");
  const [muted, setMuted] = useState(first);
  const labelId = useId();
  const hintId = useId();
  return (
    <div className="flex min-h-16 items-center gap-3 px-4 py-2.5">
      <span
        aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-2 [&_svg]:size-5"
      >
        <BellOff />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span id={labelId} className="font-medium text-ink">
          {t("mute")}
        </span>
        <span id={hintId} className="text-ink-2 text-sm">
          {t("muteHint")}
        </span>
      </span>
      <Switch
        aria-labelledby={labelId}
        aria-describedby={hintId}
        checked={muted}
        onChange={setMuted}
      />
    </div>
  );
}
