"use client";

import type { MessageAction } from "@domain/chat-announce";
import { ListGroup, ListRow } from "@ui/list-row";
import { Sheet } from "@ui/sheet";
import { Copy, Pin, PinOff, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

const ICONS: Record<MessageAction, ReactNode> = {
  copy: <Copy />,
  delete: <Trash2 />,
  remove: <Trash2 />,
  pin: <Pin />,
  unpin: <PinOff />,
};

/**
 * A message's actions (plan §11.2): copy, delete one's own, remove someone
 * else's as management in a group, pin or unpin an announcement, each one
 * row, as `messageActions` in @domain/chat-announce offers them. The message
 * itself is quoted at the top, so it is clear which one. Removing asks
 * nothing: the screen offers "ביטול" for 10 seconds after, and the database
 * keeps the way back for 10 minutes.
 */
export function MessageActionsSheet({
  open,
  onOpenChange,
  quote,
  actions,
  onAction,
  returnFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What the message says, or what it is, in a line. */
  quote: string | null;
  actions: readonly MessageAction[];
  onAction: (action: MessageAction) => void;
  /** Where the focus goes once it closed: what opened it, while it is there. */
  returnFocus?: () => HTMLElement | null | undefined;
}) {
  const t = useTranslations("app.chat");
  const words: Record<MessageAction, { title: string; hint?: string }> = {
    copy: { title: t("messageActions.copy") },
    delete: {
      title: t("messageActions.delete"),
      hint: t("messageActions.deleteHint"),
    },
    remove: {
      title: t("messageActions.remove"),
      hint: t("messageActions.removeHint"),
    },
    pin: { title: t("announcement.pin") },
    unpin: { title: t("announcement.unpin") },
  };
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("messageActions.title")}
      closeLabel={t("messageActions.close")}
      returnFocus={returnFocus}
    >
      <div className="flex flex-col gap-3 px-2 pb-2">
        {quote ? (
          <p
            dir="auto"
            className="rounded-card bg-elevated px-4 py-3 text-start text-ink-2 wrap-anywhere"
          >
            {quote}
          </p>
        ) : null}
        <ListGroup className="bg-elevated shadow-none">
          {actions.map((action) => (
            <ListRow
              key={action}
              leading={ICONS[action]}
              title={
                action === "delete" || action === "remove" ? (
                  <span className="text-danger">{words[action].title}</span>
                ) : (
                  words[action].title
                )
              }
              subtitle={words[action].hint}
              onClick={() => onAction(action)}
            />
          ))}
        </ListGroup>
      </div>
    </Sheet>
  );
}
