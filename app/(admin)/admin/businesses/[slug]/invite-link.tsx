"use client";

import { announce } from "@ui/announcer";
import { Button } from "@ui/button";
import { arrived, focusFirst } from "@ui/focus-after";
import { Link2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useLayoutEffect, useRef } from "react";
import { useAnswerCount } from "@/app/(auth)/step-results";
import {
  InviteShare,
  type InviteShareSetup,
  type InviteWords,
} from "@/app/invite-share";
import type { InviteLinkState } from "./actions";

const initial: InviteLinkState = {};

/**
 * One invited person's link: a button that issues it, then the link for the
 * team member to send on themselves, on WhatsApp to the invite's number with
 * a sentence that says what it is, or copied (`InviteShare`; closing the
 * pilot, PR 4): an owner's first link goes with the owner's own sentence
 * (`words`). For an invite that ran out, the same button renews it for
 * another 14 days. As the Team screen's "קישור חדש" (`ResendLink`): the
 * press went as the link arrived, so "שליחה בוואטסאפ" takes the focus, and says
 * whose link it sends; with the focus put elsewhere meanwhile, it stays
 * there, and the announcer says the link is ready. A refusal is a line
 * drawn anew each time, and the press, busy meanwhile, takes back the focus
 * it lost.
 */
export function InviteLink({
  inviteId,
  name,
  phone,
  share,
  words,
  renew = false,
  issue,
}: {
  inviteId: string;
  name: string;
  /** The invite's number, in E.164: where WhatsApp opens a chat. */
  phone: string | null;
  share: InviteShareSetup;
  /** The owner's sentence for an owner's invite; the team's otherwise. */
  words: InviteWords;
  /** The invite expired: the button renews it. */
  renew?: boolean;
  /** `inviteLinkAction`, or the design demo's stand-in. */
  issue: (
    inviteId: string,
    prev: InviteLinkState,
    form: FormData,
  ) => Promise<InviteLinkState>;
}) {
  const t = useTranslations("admin.setup.invite");
  const [state, action, pending] = useActionState(
    issue.bind(null, inviteId),
    initial,
  );
  const answer = useAnswerCount(state);
  const press = useRef<HTMLButtonElement>(null);
  const whatsapp = useRef<HTMLAnchorElement>(null);
  // The state it starts with is no answer.
  const seen = useRef<InviteLinkState | null>(state);

  // Each answer once, as it arrives: not when the screen is shown again.
  useLayoutEffect(() => {
    if (!arrived(seen, state)) return;
    if (!state.link) {
      focusFirst([press.current]);
      return;
    }
    if (!focusFirst([whatsapp.current])) announce(t("ready", { name }));
  }, [state, name, t]);

  if (!state.link) {
    return (
      <form action={action} className="flex flex-col items-start gap-1">
        <Button
          ref={press}
          type="submit"
          variant="secondary"
          loading={pending}
          aria-label={t(renew ? "renewFor" : "createFor", { name })}
        >
          <Link2 aria-hidden="true" />
          {t(renew ? "renew" : "create")}
        </Button>
        {state.failure ? (
          // Drawn anew for each answer, so the same refusal again is heard.
          <p key={answer} role="alert" className="text-danger text-sm">
            {t(`errors.${state.failure}`)}
          </p>
        ) : null}
      </form>
    );
  }

  return (
    <InviteShare
      link={state.link}
      phone={phone}
      name={name}
      share={share}
      words={words}
      copy={{
        label: t("linkFor", { name }),
        hint: t("hint"),
        copy: t("copy"),
        copied: t("copied"),
        failed: t("copyFailed"),
      }}
      whatsappRef={whatsapp}
    />
  );
}
