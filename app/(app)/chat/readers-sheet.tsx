"use client";

import { dateIn } from "@domain/availability";
import { chatDay, chatShortDate, messageTime } from "@domain/chat-days";
import { Button } from "@ui/button";
import { PageSection } from "@ui/page";
import { PersonList, PersonRow } from "@ui/person-row";
import { Sheet } from "@ui/sheet";
import { Spinner } from "@ui/spinner";
import { useTranslations } from "next-intl";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import type { ChatActionResult, ChatReaders } from "./chat-types";

type Loaded =
  | { kind: "loading" }
  | { kind: "failed" }
  | { kind: "done"; readers: ChatReaders };

/**
 * Who of the group confirmed an announcement, when (the day too, when it
 * wasn't today: a pinned one collects them over days), and who not yet: for
 * its author and management only (the database reads nobody for anyone
 * else). Read when the sheet opens, and again each time, so it is never
 * stale. Closed, the focus goes back to what opened it.
 */
export function ReadersSheet({
  message,
  onClose,
  load,
  timeZone,
  now,
  returnFocus,
}: {
  /** The announcement whose readers show; null keeps the sheet closed. */
  message: string | null;
  onClose: () => void;
  load: (message: string) => Promise<ChatActionResult<ChatReaders>>;
  timeZone: string;
  /** The screen's clock, for which day is today. */
  now: string | number;
  /** Where the focus goes once it closed (the button that opened it). */
  returnFocus?: () => HTMLElement | null | undefined;
}) {
  const t = useTranslations("app.chat.announcement.readers");
  const tc = useTranslations("app.chat");
  const [loaded, setLoaded] = useState<Loaded>({ kind: "loading" });

  const read = useCallback(
    async (id: string) => {
      setLoaded({ kind: "loading" });
      try {
        const result = await load(id);
        setLoaded(
          result.ok
            ? { kind: "done", readers: result.value }
            : { kind: "failed" },
        );
      } catch {
        setLoaded({ kind: "failed" });
      }
    },
    [load],
  );

  useEffect(() => {
    if (message) void read(message);
  }, [message, read]);

  const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;
  const today = dateIn(new Date(now), timeZone);
  /** "08:20" today, "אתמול · 08:20", "9.11 · 08:20" before. */
  function when(at: string): ReactNode {
    const time = messageTime(at, timeZone);
    const which = chatDay(dateIn(new Date(at), timeZone), today);
    if (which.kind === "today") return t.rich("at", { time, ltr });
    return t.rich("atDay", {
      time,
      day:
        which.kind === "yesterday"
          ? tc("day.yesterday")
          : chatShortDate(which.day, today),
      ltr,
    });
  }

  return (
    <Sheet
      open={message !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t("title")}
      subtitle={t("subtitle")}
      closeLabel={t("close")}
      readingLabel={loaded.kind === "done" ? t("title") : undefined}
      returnFocus={returnFocus}
    >
      <div
        className="flex flex-col gap-5 px-2 pb-2"
        aria-busy={loaded.kind === "loading" || undefined}
      >
        {loaded.kind === "loading" ? (
          <p className="flex items-center justify-center gap-2 py-8 text-ink-2">
            <Spinner className="size-5" />
            {t("loading")}
          </p>
        ) : loaded.kind === "failed" ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <p role="alert" className="text-center text-ink-2">
              {t("failed")}
            </p>
            {message ? (
              <Button variant="secondary" onClick={() => void read(message)}>
                {t("retry")}
              </Button>
            ) : null}
          </div>
        ) : (
          <>
            <PageSection
              title={t("confirmed")}
              level={3}
              action={
                <span className="text-ink-2 text-sm" dir="ltr">
                  {loaded.readers.confirmed.length}
                </span>
              }
            >
              {loaded.readers.confirmed.length > 0 ? (
                <PersonList className="bg-elevated shadow-none">
                  {loaded.readers.confirmed.map((reader) => (
                    <PersonRow
                      key={reader.person}
                      name={reader.name}
                      photo={reader.photo}
                      title={reader.name ?? tc("list.noName")}
                      subtitle={reader.ackedAt ? when(reader.ackedAt) : null}
                    />
                  ))}
                </PersonList>
              ) : (
                <p className="px-1 text-ink-2">{t("none")}</p>
              )}
            </PageSection>
            <PageSection
              title={t("waiting")}
              level={3}
              action={
                <span className="text-ink-2 text-sm" dir="ltr">
                  {loaded.readers.waiting.length}
                </span>
              }
            >
              {loaded.readers.waiting.length > 0 ? (
                <PersonList className="bg-elevated shadow-none">
                  {loaded.readers.waiting.map((reader) => (
                    <PersonRow
                      key={reader.person}
                      name={reader.name}
                      photo={reader.photo}
                      title={reader.name ?? tc("list.noName")}
                    />
                  ))}
                </PersonList>
              ) : (
                <p className="px-1 text-ink-2">{t("all")}</p>
              )}
            </PageSection>
          </>
        )}
      </div>
    </Sheet>
  );
}
