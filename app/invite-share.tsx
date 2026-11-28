"use client";

import { isolateName } from "@domain/bidi";
import { inviteWhatsappHref, shareText } from "@domain/share";
import { Button } from "@ui/button";
import { cn } from "@ui/cn";
import { MessageCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { type Ref, useState } from "react";
import { CopyLink } from "@/app/copy-link";

/*
 * Every invite's link goes out on WhatsApp, with a sentence that says what
 * it is (closing the pilot, PR 4; Orel, 25 November 2026): the invite form's
 * link, "קישור חדש", the console's link and "עוד לא קיבלו קישור". A chat to
 * the person's own number with the sentence and the link written, which the
 * person sending still sends in WhatsApp: the app sends nothing. The copy is
 * the second way, as before.
 */

/**
 * Where an invite's link goes on WhatsApp: the business its sentence names,
 * and whether to the number it was made for (`toNumber`: the real screens,
 * behind the database) or, on a twin, whose made-up numbers may be
 * someone's, to whomever WhatsApp is told.
 */
export type InviteShareSetup = { business: string; toNumber: boolean };

/**
 * Which sentence a link goes with: the team's (`app.team.pending.message`,
 * which a business may reword), or the owner's own, from the console
 * (`admin.setup.invite.ownerMessage`).
 */
export type InviteWords = "team" | "owner";

/**
 * What the focus moves on to after a press (the link's WhatsApp, the next
 * person's "יצירת קישור") comes into view clear of the tab bar floating over
 * the page's bottom on phones and tablets (`AppShell`, its band and its
 * fade): the browser counts nothing fixed over the page, so a control on
 * screen under the bar would take the focus there (WCAG 2.4.11). A computer
 * has no bar.
 */
export const clearOfTabBar =
  "max-xl:scroll-mb-[calc(env(safe-area-inset-bottom)+6rem)]";

/** The sentence an invite's link goes with, its business held as a name (`isolateName`). */
function useInviteMessage(): (business: string, words: InviteWords) => string {
  const team = useTranslations("app.team.pending");
  const owner = useTranslations("admin.setup.invite");
  return (business, words) => {
    const named = { business: isolateName(business) };
    return words === "owner"
      ? owner("ownerMessage", named)
      : team("message", named);
  };
}

/**
 * One invite's link, ready to send: "וואטסאפ" first (a real link, opened by
 * the press itself, so nothing blocks it; named by whose link it sends), to
 * the number it was made for with the sentence and the link written
 * (`inviteWhatsappHref`), then the link with its copy button (`CopyLink`).
 * After WhatsApp opened, a line says so (`opened`, for a screen that keeps it
 * for every shape at once; here otherwise). The text names nobody: the
 * business, the sentence and the link. `main`: the screen's one main action
 * (the invite form's link), in the accent; a row's is quiet.
 */
export function InviteShare({
  link,
  phone,
  name,
  share,
  words = "team",
  main = false,
  copy,
  whatsappRef,
  opened,
  onWhatsapp,
  onCopied,
}: {
  link: string;
  /** The number the link was made for, in E.164; null where there is none. */
  phone: string | null;
  /** Whose link it is, as the screen shows them. */
  name: string;
  share: InviteShareSetup;
  words?: InviteWords;
  main?: boolean;
  /** The copy's words (`CopyLink`), in the screen's own. */
  copy: {
    label: string;
    hint: string;
    copy: string;
    copied: string;
    failed: string;
  };
  /** "וואטסאפ", for a screen that brings the focus there. */
  whatsappRef?: Ref<HTMLAnchorElement>;
  /** WhatsApp was opened, as the screen keeps it; this piece's own otherwise. */
  opened?: boolean;
  /** WhatsApp is opening: for a list that moves on to the next person. */
  onWhatsapp?: (anchor: HTMLAnchorElement) => void;
  /** A copy went (`CopyLink`): the same. */
  onCopied?: (button: HTMLButtonElement) => void;
}) {
  const t = useTranslations("app.team.pending");
  const message = useInviteMessage();
  const [pressed, setPressed] = useState(false);
  const text = shareText(message(share.business, words), link);
  return (
    <div className="flex w-full min-w-0 flex-col gap-3">
      <Button
        asChild
        variant={main ? "primary" : "secondary"}
        size={main ? "lg" : "md"}
        className={cn("w-full md:w-auto md:self-start", clearOfTabBar)}
      >
        <a
          ref={whatsappRef}
          href={inviteWhatsappHref(text, share.toNumber ? phone : null)}
          target="_blank"
          rel="noopener noreferrer"
          // The word it shows, then whom it goes to.
          aria-label={t("whatsappFor", { name })}
          onClick={(event) => {
            setPressed(true);
            onWhatsapp?.(event.currentTarget);
          }}
        >
          <MessageCircle aria-hidden="true" />
          {t("whatsapp")}
        </a>
      </Button>
      {(opened ?? pressed) ? (
        <p className="px-1 text-ink-2 text-sm">{t("opened")}</p>
      ) : null}
      <CopyLink
        link={link}
        label={copy.label}
        hint={copy.hint}
        copy={copy.copy}
        copied={copy.copied}
        failed={copy.failed}
        onCopied={onCopied}
      />
    </div>
  );
}
