"use client";

import { Button } from "@ui/button";
import { Link2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { CopyLink } from "@/app/copy-link";
import type { InviteLinkState } from "./actions";

const initial: InviteLinkState = {};

/**
 * One invited person's link: a button that issues it, then the link with
 * a copy button, for the team member to send on themselves.
 */
export function InviteLink({
  inviteId,
  name,
  issue,
}: {
  inviteId: string;
  name: string;
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

  if (!state.link) {
    return (
      <form action={action} className="flex flex-col items-start gap-1">
        <Button
          type="submit"
          variant="secondary"
          loading={pending}
          aria-label={t("createFor", { name })}
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
