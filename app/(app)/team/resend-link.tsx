"use client";

import { Button } from "@ui/button";
import { arrived, focusFirst } from "@ui/focus-after";
import { Link2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useLayoutEffect, useRef } from "react";
import { CopyLink } from "@/app/copy-link";
import { useAnswerCount } from "../../(auth)/step-results";
import type { ResendState } from "./actions";

const initial: ResendState = {};

/**
 * "New link" for one invite nobody claimed: issues a fresh link (the old
 * one stops working), then shows it with a copy button to send on. The
 * press went as the link arrived, so the copy button takes the focus, and
 * says whose link it copies; a refusal is a line drawn anew each time, and
 * the press, busy meanwhile, takes back the focus it lost. Never the focus
 * from where the person put it meanwhile.
 */
export function ResendLink({
  inviteId,
  name,
  resend,
}: {
  inviteId: string;
  name: string;
  /** `resendInviteAction`, or the design demo's stand-in. */
  resend: (
    inviteId: string,
    prev: ResendState,
    form: FormData,
  ) => Promise<ResendState>;
}) {
  const t = useTranslations("app.team.link");
  const [state, action, pending] = useActionState(
    resend.bind(null, inviteId),
    initial,
  );
  const answer = useAnswerCount(state);
  const press = useRef<HTMLButtonElement>(null);
  const copy = useRef<HTMLButtonElement>(null);
  // The state it starts with is no answer.
  const seen = useRef<ResendState | null>(state);

  // Each answer once, as it arrives: not when the screen is shown again.
  useLayoutEffect(() => {
    if (!arrived(seen, state)) return;
    focusFirst([state.link ? copy.current : press.current]);
  }, [state]);

  if (state.link) {
    return (
      <CopyLink
        link={state.link}
        label={t("linkFor", { name })}
        hint={t("hint")}
        copy={t("copy")}
        copied={t("copied")}
        buttonRef={copy}
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
