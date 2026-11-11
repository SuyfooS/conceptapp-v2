"use client";

import { Button } from "@ui/button";
import { ListGroup } from "@ui/list-row";
import { PersonAvatar } from "@ui/person-row";
import { Sheet } from "@ui/sheet";
import { TextField } from "@ui/text-field";
import { VisibilityNote } from "@ui/visibility-note";
import { ChevronRight, SquarePen } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";

export type NewMessagePerson = {
  id: string;
  name: string;
  line: string;
  photo: string | null;
  /** Their private chat with the reader, or a new one. */
  href: string;
};

/**
 * The chat list's main action: a sheet of everyone else on the team, with a
 * search by name. Choosing someone closes it and opens their private chat,
 * or a new one.
 */
export function NewMessage({
  people,
  quiet = false,
}: {
  people: NewMessagePerson[];
  /** Beside a conversation, whose main action is sending. */
  quiet?: boolean;
}) {
  const t = useTranslations("app.chat");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wanted = query.trim().toLocaleLowerCase();
  const shown = wanted
    ? people.filter((p) => p.name.toLocaleLowerCase().includes(wanted))
    : people;
  return (
    <>
      <Button
        variant={quiet ? "secondary" : "primary"}
        onClick={() => {
          setQuery("");
          setOpen(true);
        }}
      >
        <SquarePen aria-hidden="true" />
        {t("list.newMessage")}
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={t("list.newMessage")}
        closeLabel={t("newMessage.close")}
      >
        <div className="flex flex-col gap-3 px-2 pb-2">
          <VisibilityNote icon="lock">{t("newMessage.hint")}</VisibilityNote>
          <TextField
            label={t("newMessage.search")}
            type="search"
            autoComplete="off"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {shown.length > 0 ? (
            <ListGroup className="bg-elevated shadow-none">
              {shown.map((person) => (
                <Link
                  key={person.id}
                  href={person.href}
                  onClick={() => setOpen(false)}
                  className="relative flex min-h-16 items-center gap-3 px-4 py-2.5 transition-colors duration-150 ease-calm not-first:before:absolute not-first:before:start-[68px] not-first:before:end-0 not-first:before:top-0 not-first:before:h-px not-first:before:bg-line not-first:before:content-[''] hover:bg-surface-2 active:bg-surface-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                >
                  <PersonAvatar name={person.name} photo={person.photo} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-medium text-ink">{person.name}</span>
                    <span className="text-ink-2 text-sm">{person.line}</span>
                  </span>
                  <ChevronRight
                    aria-hidden="true"
                    className="size-5 shrink-0 text-ink-2 rtl:-scale-x-100"
                  />
                </Link>
              ))}
            </ListGroup>
          ) : (
            <p className="px-2 py-6 text-center text-ink-2">
              {t("newMessage.none")}
            </p>
          )}
        </div>
      </Sheet>
    </>
  );
}
