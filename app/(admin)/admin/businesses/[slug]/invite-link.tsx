"use client";

import { Button } from "@ui/button";
import { ltrInputClass, TextField } from "@ui/text-field";
import { Check, Copy, Link2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { type InviteLinkState, inviteLinkAction } from "./actions";

const initial: InviteLinkState = {};

/**
 * One invited person's link: a button that issues it, then the link with
 * a copy button, for the team member to send on themselves.
 */
export function InviteLink({
  inviteId,
  name,
}: {
  inviteId: string;
  name: string;
}) {
  const t = useTranslations("admin.setup.invite");
  const [state, action, pending] = useActionState(
    inviteLinkAction.bind(null, inviteId),
    initial,
  );
  const [copied, setCopied] = useState(false);

  if (!state.link) {
    return (
      <form action={action} className="flex flex-col gap-1">
        <Button
          type="submit"
          variant="secondary"
          loading={pending}
          aria-label={t("createFor", { name })}
          className="w-full md:w-auto"
        >
          <Link2 aria-hidden="true" />
          {t("create")}
        </Button>
        {state.failure ? (
          <p role="alert" className="text-danger text-sm">
            {t(`errors.${state.failure}`)}
          </p>
        ) : null}
      </form>
    );
  }

  const copy = async () => {
    await navigator.clipboard.writeText(state.link);
    setCopied(true);
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <TextField
        label={t("linkFor", { name })}
        value={state.link}
        readOnly
        dir="ltr"
        className={ltrInputClass}
        onFocus={(event) => event.currentTarget.select()}
        hint={t("hint")}
      />
      <Button
        type="button"
        variant="secondary"
        onClick={copy}
        aria-live="polite"
        className="w-full md:w-auto md:self-start"
      >
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        {copied ? t("copied") : t("copy")}
      </Button>
    </div>
  );
}
