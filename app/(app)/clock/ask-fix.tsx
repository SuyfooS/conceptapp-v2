"use client";

import { Button } from "@ui/button";
import { cn } from "@ui/cn";
import { PersonList, PersonRow } from "@ui/person-row";
import { Sheet } from "@ui/sheet";
import { MessageCircle } from "lucide-react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useRef, useState } from "react";
import type { ClockAskFix, HoursFixerLink } from "./clock-types";

/**
 * Whom the person asks to correct their hours (closing the pilot, PR 8),
 * under the clock's refusals that say to ask whoever approves hours and
 * beside "צריך תיקון" in their shifts: "כתיבה ל{name}", a link to their
 * private chat (`/chat/with/<them>`, an empty one that the first message
 * makes, or the one they have); with several, "כתיבה למי שמאשר שעות", which
 * opens a sheet of them to pick from, those in the person's departments
 * first, each with their departments or else their role; with chat off,
 * only their names. Nothing is sent from here: the person writes in the
 * chat. The addresses come from the server (`HoursFixerLink`), so this, in
 * the clock's download, takes nothing from chat's files.
 */
export function AskFix({
  ask,
  className,
}: {
  ask: ClockAskFix;
  className?: string;
}) {
  const t = useTranslations("app.clock.history.askFix");
  const roles = useTranslations("app.team.roles");
  const format = useFormatter();
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);

  if (ask.kind === "name") {
    const names = ask.people.flatMap((person) =>
      person.name ? [person.name] : [],
    );
    const [only] = names;
    if (!only) return null;
    // A span, so it may sit in a row's lines as in the clock's.
    return (
      <span className={cn("block text-ink-2 text-sm", className)}>
        {names.length === 1
          ? t("named", { name: only })
          : t("namedSome", {
              names: format.list(names, { type: "conjunction" }),
            })}
      </span>
    );
  }

  if (ask.kind === "write" && ask.person.href) {
    const { person } = ask;
    return (
      <Button asChild variant="secondary" className={className}>
        <Link href={ask.person.href}>
          <MessageCircle aria-hidden="true" />
          {person.name ? t("write", { name: person.name }) : t("writeAny")}
        </Link>
      </Button>
    );
  }

  if (ask.kind === "write") {
    // Not in chat after all: named, as with chat off.
    return ask.person.name ? (
      <span className={cn("block text-ink-2 text-sm", className)}>
        {t("named", { name: ask.person.name })}
      </span>
    ) : null;
  }

  const line = (person: HoursFixerLink) =>
    person.departments.length > 0
      ? person.departments.join(" · ")
      : roles(person.role);
  return (
    <>
      <Button
        ref={opener}
        variant="secondary"
        aria-haspopup="dialog"
        className={className}
        onClick={() => setOpen(true)}
      >
        <MessageCircle aria-hidden="true" />
        {t("writeAny")}
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={t("pickTitle")}
        subtitle={t("pickHint")}
        closeLabel={t("close")}
        returnFocus={() => opener.current}
      >
        <div className="px-2 pb-2">
          <PersonList className="bg-elevated shadow-none">
            {ask.people.map((person) => (
              <PersonRow
                key={person.id}
                name={person.name}
                title={person.name ?? t("noName")}
                subtitle={line(person)}
                // Someone chat can't reach is named, not linked.
                {...(person.href
                  ? {
                      href: person.href,
                      // The clock is kept hidden behind the chat (Next's
                      // Activity): closed now, it isn't open on the way back.
                      onClick: () => setOpen(false),
                    }
                  : {})}
              />
            ))}
          </PersonList>
        </div>
      </Sheet>
    </>
  );
}
