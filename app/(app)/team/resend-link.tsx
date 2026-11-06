"use client";

import { Button } from "@ui/button";
import { Link2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { CopyLink } from "@/app/copy-link";
import type { ResendState } from "./actions";

const initial: ResendState = {};

/**
 * "New link" for one invite nobody claimed: issues a fresh link (the old
 * one stops working), then shows it with a copy button to send on.
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

  if (state.link) {
    return (
      <CopyLink
        link={state.link}
        label={t("linkFor", { name })}
        hint={t("hint")}
        copy={t("copy")}
        copied={t("copied")}
      />
    );
  }

  return (
    <form action={action} className="flex flex-col items-start gap-1">
      <Button
        type="submit"
        variant="secondary"
        loading={pending}
        aria-label={t("newFor", { name })}
      >
        <Link2 aria-hidden="true" />
        {t("new")}
      </Button>
      {state.failure ? (
        <p role="alert" className="text-danger text-sm">
          {t(`errors.${state.failure}`)}
        </p>
      ) : null}
    </form>
  );
}
