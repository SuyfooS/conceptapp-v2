"use client";

import type { Role } from "@domain/modules";
import { TEAM_NAME_MAX } from "@domain/team";
import { Button } from "@ui/button";
import { Card, CardText } from "@ui/card";
import { cn } from "@ui/cn";
import { PhoneField } from "@ui/phone-field";
import { TextField } from "@ui/text-field";
import { Send } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { CopyLink } from "@/app/copy-link";
import type { InviteState } from "../actions";

const initial: InviteState = {};

/**
 * Invite someone by phone: name, mobile and role, then the link to send
 * on. `roles` are the ones the signed-in person may give, most senior
 * first; the default is the last (worker), the usual case.
 */
type InviteFormProps = {
  roles: readonly Role[];
  teamHref: string;
  /** `inviteAction`, or the design demo's stand-in. */
  invite: (prev: InviteState, form: FormData) => Promise<InviteState>;
};

export function InviteForm(props: InviteFormProps) {
  // "Invite someone else" starts over with a fresh form and state.
  const [round, setRound] = useState(0);
  return (
    <InviteRound key={round} {...props} onAnother={() => setRound(round + 1)} />
  );
}

function InviteRound({
  roles,
  teamHref,
  invite,
  onAnother,
}: InviteFormProps & { onAnother: () => void }) {
  const t = useTranslations("app.team.invite");
  const tr = useTranslations("app.team.roles");
  const tl = useTranslations("app.team.link");
  const [state, action, pending] = useActionState(invite, initial);

  if (state.done) {
    const { name, link } = state.done;
    return (
      <Card tone="raised" padding="lg" className="flex flex-col gap-4">
        <h2 className="font-bold text-md">{t("ready", { name })}</h2>
        <CardText>{t("readyBody")}</CardText>
        <CopyLink
          link={link}
          label={tl("linkFor", { name })}
          hint={tl("hint")}
          copy={tl("copy")}
          copied={tl("copied")}
        />
        <div className="flex flex-col gap-2 md:flex-row">
          <Button asChild variant="secondary">
            <Link href={teamHref}>{t("backToTeam")}</Link>
          </Button>
          <Button type="button" variant="ghost" onClick={onAnother}>
            {t("another")}
          </Button>
        </div>
      </Card>
    );
  }

  const errors = state.errors ?? {};
  const values = state.values;
  const defaultRole = values?.role || roles[roles.length - 1];

  return (
    <form action={action} noValidate className="flex flex-col gap-5">
      <TextField
        name="name"
        label={t("name")}
        autoComplete="off"
        maxLength={TEAM_NAME_MAX}
        defaultValue={values?.name}
        error={errors.name ? t(`errors.name.${errors.name}`) : undefined}
        required
      />
      <PhoneField
        name="phone"
        label={t("phone")}
        autoComplete="off"
        defaultValue={values?.phone}
        error={errors.phone ? t(`errors.phone.${errors.phone}`) : undefined}
        hint={t("phoneHint")}
        required
      />
      <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
        <legend className="mb-1.5 font-medium text-ink text-sm">
          {t("role")}
        </legend>
        <div className="grid gap-2 md:grid-cols-3">
          {roles.map((role) => (
            <label
              key={role}
              className={cn(
                "flex min-h-11 cursor-pointer items-center gap-3 rounded-control border border-line bg-surface px-4 py-3",
                "transition-colors duration-150 ease-calm has-checked:border-accent has-checked:ring-1 has-checked:ring-accent",
              )}
            >
              <input
                type="radio"
                name="role"
                value={role}
                defaultChecked={role === defaultRole}
                className="size-5 shrink-0 accent-accent"
              />
              <span className="flex flex-col">
                <span className="font-medium">{tr(role)}</span>
                <span className="text-ink-2 text-sm">
                  {t(`roleHint.${role}`)}
                </span>
              </span>
            </label>
          ))}
        </div>
        {errors.role ? (
          <p className="text-danger text-sm">
            {t(`errors.role.${errors.role}`)}
          </p>
        ) : null}
      </fieldset>
      {state.failure ? (
        <p role="alert" className="text-danger">
          {t(`errors.${state.failure}`)}
        </p>
      ) : null}
      <Button
        type="submit"
        size="lg"
        loading={pending}
        className="md:self-start"
      >
        <Send aria-hidden="true" className="rtl:-scale-x-100" />
        {t("submit")}
      </Button>
    </form>
  );
}
