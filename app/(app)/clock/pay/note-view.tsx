"use client";

import { useEffect, useRef } from "react";
import type { NotePayView } from "./pay-types";

/**
 * Notes that a pay screen is on screen, once, after it mounts: never while the
 * page renders, which a prefetch does too, so a page nobody opened logs
 * nothing (`payroll.view`, once a day per person). Draws nothing; a failure
 * changes nothing on the screen.
 */
export function NoteView({
  month,
  kind,
  note,
}: {
  month: string;
  kind: "month" | "person" | "access";
  note: NotePayView;
}) {
  const noted = useRef<string | null>(null);
  useEffect(() => {
    const key = `${kind}:${month}`;
    if (noted.current === key) return;
    noted.current = key;
    note(month, kind).catch(() => {
      // The record is the database's to keep; the screen stays as it is.
    });
  }, [month, kind, note]);
  return null;
}
