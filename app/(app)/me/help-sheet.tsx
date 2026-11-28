"use client";

import { isolateName } from "@domain/bidi";
import { whatsappHref, whatsappToHref } from "@domain/share";
import { Button } from "@ui/button";
import { ListGroup, ListRow } from "@ui/list-row";
import { PersonList, PersonRow } from "@ui/person-row";
import { Sheet } from "@ui/sheet";
import { LifeBuoy, MessageCircle } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import type { ClockAskFix, HoursFixerLink } from "../clock/clock-types";

/**
 * What "עזרה" offers (closing the pilot, PR 15, `currentHelp`): whom to ask
 * in the business, as the clock offers whoever corrects hours, each with
 * their private chat's address where chat is open to the person; and
 * ConceptApp's team on WhatsApp, for an owner, a manager or the accountant
 * where the deployment names its number.
 */
export type HelpData = {
  ask: ClockAskFix | null;
  /**
   * ConceptApp's team: its WhatsApp number in E.164, or null on a twin,
   * whose made-up number may be someone's, so WhatsApp asks whom to write
   * to. Null for no team at all.
   */
  team: { phone: string | null } | null;
  /** The business, named in the sentence WhatsApp opens with. */
  business: string;
};

/**
 * "עזרה" on the profile: one row, saying whom it reaches, that opens a sheet.
 * In it, whom to ask in the business: "לשאול את {name}", a link to their
 * private chat (the one they have, or an empty one that the first message
 * makes), one person or each of several, those in the person's departments
 * first, with their departments or else their role; with chat closed to the
 * person, only their names. Then, where it is offered, ConceptApp's team:
 * what it answers, its hours, and "וואטסאפ לצוות של ConceptApp", WhatsApp to
 * its number with a sentence written that names only the business (the
 * person still presses send there). Nothing is sent from here.
 */
export function HelpSection({ help }: { help: HelpData }) {
  const t = useTranslations("app.me.help");
  const roles = useTranslations("app.team.roles");
  const format = useFormatter();
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement | null>(null);
  const teamTitle = useId();
  const { ask, team } = help;

  const people: HoursFixerLink[] =
    ask === null ? [] : ask.kind === "write" ? [ask.person] : ask.people;
  const [first] = people;
  const one = people.length === 1 ? (first?.name ?? null) : null;
  const hint =
    people.length === 0
      ? t("hint.team")
      : one !== null
        ? t(team ? "hint.oneOrTeam" : "hint.one", { name: one })
        : t(team ? "hint.someOrTeam" : "hint.some");

  const message = t("team.message", { business: isolateName(help.business) });
  const whatsapp = team
    ? team.phone
      ? whatsappToHref(team.phone, message)
      : whatsappHref(message)
    : null;
  const named =
    ask?.kind === "name"
      ? ask.people.flatMap((person) => (person.name ? [person.name] : []))
      : [];

  const line = (person: HoursFixerLink) =>
    person.departments.length > 0
      ? person.departments.join(" · ")
      : roles(person.role);

  return (
    <>
      <ListGroup className="min-w-0">
        <ListRow
          leading={<LifeBuoy />}
          title={t("row")}
          subtitle={hint}
          onClick={(event) => {
            opener.current = event.currentTarget;
            setOpen(true);
          }}
        />
      </ListGroup>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={t("title")}
        subtitle={t("subtitle")}
        closeLabel={t("close")}
        returnFocus={() => opener.current}
        // Only names, and nothing to press: the sheet only reads.
        readingLabel={
          whatsapp === null && named.length > 0 ? t("title") : undefined
        }
      >
        <div className="flex flex-col gap-4 px-2 pb-2">
          {named.length > 0 ? (
            <p className="px-2 text-md">
              {t("named", {
                names: format.list(named, { type: "conjunction" }),
              })}
            </p>
          ) : people.length > 0 ? (
            <PersonList className="bg-elevated shadow-none">
              {people.map((person) => (
                <PersonRow
                  key={person.id}
                  name={person.name}
                  title={
                    person.href
                      ? person.name
                        ? t("ask", { name: person.name })
                        : t("askAny")
                      : (person.name ?? t("noName"))
                  }
                  subtitle={line(person)}
                  // Someone chat can't reach is named, not linked.
                  {...(person.href
                    ? {
                        href: person.href,
                        // The profile is kept hidden behind the chat (Next's
                        // Activity): closed now, it isn't open on the way back.
                        onClick: () => setOpen(false),
                      }
                    : {})}
                />
              ))}
            </PersonList>
          ) : null}
          {whatsapp ? (
            <section
              aria-labelledby={teamTitle}
              className="flex flex-col gap-3 rounded-card bg-elevated p-4"
            >
              <h3 id={teamTitle} className="font-semibold text-md">
                {t("team.title")}
              </h3>
              <div className="flex flex-col gap-1">
                <p className="text-base text-ink-2">{t("team.body")}</p>
                <p className="text-base">{t("team.hours")}</p>
              </div>
              <Button
                asChild
                variant="secondary"
                className="w-full md:w-auto md:self-start"
              >
                <a href={whatsapp} target="_blank" rel="noopener noreferrer">
                  <MessageCircle aria-hidden="true" />
                  {t("team.whatsapp")}
                </a>
              </Button>
            </section>
          ) : null}
        </div>
      </Sheet>
    </>
  );
}
