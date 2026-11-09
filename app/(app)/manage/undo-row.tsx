"use client";

import { Button } from "@ui/button";
import { useTranslations } from "next-intl";

/** What was just removed, with the way back, where the person is looking. */
export function UndoRow({
  message,
  onUndo,
  pending = false,
}: {
  message: string;
  onUndo: () => void;
  /** The way back is on its way: the button spins and waits. */
  pending?: boolean;
}) {
  const t = useTranslations("app.manage");
  return (
    <div
      role="status"
      className="flex min-h-[3.25rem] items-center justify-between gap-3 rounded-card bg-surface-2 ps-4 pe-1.5"
    >
      <span className="min-w-0 text-base">{message}</span>
      <Button
        variant="ghost"
        loading={pending}
        onClick={onUndo}
        className="shrink-0"
      >
        {t("undo")}
      </Button>
    </div>
  );
}
