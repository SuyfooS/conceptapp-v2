"use client";

import { announce } from "@ui/announcer";
import { Button } from "@ui/button";
import { arrived, focusFirst, focusOrSay } from "@ui/focus-after";
import { Link2 } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  createContext,
  type ReactNode,
  use,
  useActionState,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { InviteShare, type InviteShareSetup } from "@/app/invite-share";
import { useAnswerCount } from "../../(auth)/step-results";
import type { ResendState } from "./actions";

const initial: ResendState = {};

type Links = {
  /** The new links made on screen, by invite. */
  links: ReadonlyMap<string, string>;
  keep: (inviteId: string, link: string) => void;
};

const LinksContext = createContext<Links | null>(null);

/**
 * The new links made on the Team screen, by invite, for every shape at once:
 * a link made in the lists is the one the computer's table shows, and back,
 * so a screen that crosses from one to the other (a tablet turned, a window
 * made wider) shows the same link, never "קישור חדש" again, whose press
 * would stop the link just sent from working.
 */
export function InviteLinks({ children }: { children: ReactNode }) {
  const [links, setLinks] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  const keep = (inviteId: string, link: string) =>
    setLinks((all) => new Map(all).set(inviteId, link));
  return <LinksContext value={{ links, keep }}>{children}</LinksContext>;
}

/**
 * The links made on screen (`InviteLinks`), for the other row that makes
 * them: "עוד לא קיבלו קישור"'s (`SendLinkRow`), so a link made there is the
 * one every shape shows too. Null outside one.
 */
export function useInviteLinks(): Links | null {
  return use(LinksContext);
}

/**
 * "New link" for one invite nobody claimed: issues a fresh link (the old
 * one stops working, and the invite runs another 14 days), then shows it
 * to send on, in every shape of the screen (`InviteLinks`): "שליחה בוואטסאפ" to
 * the invite's number with the sentence and the link written, and the link
 * with its copy button (`InviteShare`; closing the pilot, PR 4). The press
 * went as the link arrived, so "שליחה בוואטסאפ" takes the focus, and says whose
 * link it sends, as "עוד לא קיבלו קישור" does; with the focus put elsewhere
 * meanwhile, it stays there, and the announcer says the link is ready. A
 * refusal is a line drawn anew each time, and the press, busy meanwhile,
 * takes back the focus it lost.
 */
export function ResendLink({
  inviteId,
  name,
  phone,
  share,
  resend,
}: {
  inviteId: string;
  name: string;
  /** The invite's number, in E.164: where WhatsApp opens a chat. */
  phone: string;
  share: InviteShareSetup;
  /** `resendInviteAction`, or the design demo's stand-in. */
  resend: (
    inviteId: string,
    prev: ResendState,
    form: FormData,
  ) => Promise<ResendState>;
}) {
  const t = useTranslations("app.team.link");
  const shared = use(LinksContext);
  const [state, action, pending] = useActionState(
    resend.bind(null, inviteId),
    initial,
  );
  const answer = useAnswerCount(state);
  const press = useRef<HTMLButtonElement>(null);
  const whatsapp = useRef<HTMLAnchorElement>(null);
  // The state it starts with is no answer.
  const seen = useRef<ResendState | null>(state);

  // Each answer once, as it arrives: not when the screen is shown again.
  useLayoutEffect(() => {
    if (!arrived(seen, state)) return;
    if (!state.link) {
      focusFirst([press.current]);
      return;
    }
    shared?.keep(inviteId, state.link);
    // Never the page's title in its place (the other shape on screen now):
    // the link ready is said, then the title.
    focusOrSay([whatsapp.current], () => announce(t("ready", { name })));
  }, [state, shared, inviteId, name, t]);

  // Made here, or in the screen's other shape.
  const link = state.link ?? shared?.links.get(inviteId);
  if (link) {
    return (
      <InviteShare
        link={link}
        phone={phone}
        name={name}
        share={share}
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

  return (
    <form action={action} className="flex flex-col items-start gap-1">
      <Button
        ref={press}
        type="submit"
        variant="secondary"
        loading={pending}
        aria-label={t("newFor", { name })}
      >
        <Link2 aria-hidden="true" />
        {t("new")}
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
