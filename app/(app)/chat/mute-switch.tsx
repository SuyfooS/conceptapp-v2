"use client";

import { Switch } from "@ui/switch";
import { BellOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { useChat } from "./chat-provider";
import type { ChatActionResult } from "./chat-types";

/**
 * "בלי התראות מהשיחה הזאת" (`public.mute_chat`): no notification from the
 * conversation reaches the reader's phone, and it still counts as unread in
 * the app. Nobody else learns of it. It takes effect at once on screen, and
 * goes back with a word when the server didn't keep it; the list's mark
 * follows (ChatRow).
 */
export function MuteSwitch({
  conversation,
  mute,
}: {
  conversation: string;
  mute: (conversation: string, muted: boolean) => Promise<ChatActionResult>;
}) {
  const t = useTranslations("app.chat.info");
  const chat = useChat();
  const labelId = useId();
  const hintId = useId();
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const muted =
    chat.rows.find((row) => row.conversation === conversation)?.muted ?? false;

  async function change(next: boolean) {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    chat.changeRowLocally(conversation, (row) => ({ ...row, muted: next }));
    let result: ChatActionResult;
    try {
      result = await mute(conversation, next);
    } catch {
      result = { ok: false, failure: "failed" };
    }
    setBusy(false);
    if (!result.ok) {
      chat.changeRowLocally(conversation, (row) => ({ ...row, muted: !next }));
      setFailed(true);
      return;
    }
    chat.syncNow();
  }

  return (
    <div className="flex flex-col gap-1">
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
          onChange={(next) => void change(next)}
        />
      </div>
      {failed ? (
        <p role="alert" className="px-4 pb-2 text-danger text-sm">
          {t("muteFailed")}
        </p>
      ) : null}
    </div>
  );
}
