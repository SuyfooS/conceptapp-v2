"use client";

import { type ListItemKind, numberRange } from "@domain/lists";
import { Card } from "@ui/card";
import {
  Camera,
  CircleCheck,
  Hash,
  type LucideIcon,
  NotebookPen,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { PreviewItem } from "./list-types";

/** Each kind of item's icon, the same on every lists screen. */
export const ITEM_ICONS: Record<ListItemKind, LucideIcon> = {
  check: CircleCheck,
  number: Hash,
  note: NotebookPen,
  photo: Camera,
};

const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

/**
 * A list as the person it goes to will see it: its name, the note on top and
 * its items, each with its kind, its range, an order's count ("8 asked for")
 * and whether it may stay empty. On the send screen and beside the template
 * editor, from a tablet up.
 */
export function ListPreview({
  name,
  note,
  items,
}: {
  name: string;
  note: string | null;
  items: readonly PreviewItem[];
}) {
  const t = useTranslations("app.lists");
  return (
    <Card tone="flat" padding="lg" className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <span className="font-semibold text-md">
          {name || t("templates.editor.newTitle")}
        </span>
        <span className="text-ink-2 text-sm">
          {t("send.items", { count: items.length })}
        </span>
      </div>
      {note ? (
        <p className="whitespace-pre-line text-base text-ink-2">{note}</p>
      ) : null}
      {items.length > 0 ? (
        <ul className="flex flex-col gap-2.5">
          {items.map((item, index) => {
            const Icon = ITEM_ICONS[item.kind];
            const range = item.kind === "number" ? numberRange(item) : null;
            const requested =
              item.kind === "check" &&
              item.requested !== undefined &&
              item.requested !== null
                ? item.requested
                : null;
            return (
              <li
                // Items have no id until they are saved; the preview follows
                // the editor's order.
                // biome-ignore lint/suspicious/noArrayIndexKey: see above
                key={index}
                className="flex items-start gap-2.5 text-base"
              >
                <Icon
                  aria-hidden="true"
                  className="mt-0.5 size-5 shrink-0 text-ink-2"
                />
                <span className="flex min-w-0 flex-col">
                  <span>{item.label}</span>
                  {range || requested !== null || !item.required ? (
                    <span className="text-ink-2 text-sm">
                      {[
                        range
                          ? t.rich(`list.range.${range.kind}`, {
                              range: range.range,
                              ltr,
                            })
                          : null,
                        requested !== null
                          ? t("list.requested", { count: requested })
                          : null,
                        item.required ? null : t("list.optional"),
                      ]
                        .filter((part) => part !== null)
                        .map((part, at) => (
                          // biome-ignore lint/suspicious/noArrayIndexKey: fixed parts
                          <span key={at}>
                            {at > 0 ? " · " : null}
                            {part}
                          </span>
                        ))}
                    </span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </Card>
  );
}
