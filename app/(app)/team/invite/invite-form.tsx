"use client";

import type { Role } from "@domain/modules";
import { TEAM_NAME_MAX } from "@domain/team";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { ChoiceList, ChoiceRow } from "@ui/choice-row";
import { cn } from "@ui/cn";
import { FieldGroup, GroupedField, GroupedPhoneField } from "@ui/field-group";
import { FloatingAction, floatingButtonClass } from "@ui/floating-action";
import { PersonAvatar } from "@ui/person-row";
import { Send, Smartphone } from "lucide-react";
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
  /** Where "back" goes once the link is ready: the team, or the console's business. */
  back: { href: string; label: string };
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
  back,
  invite,
  onAnother,
}: InviteFormProps & { onAnother: () => void }) {
  const t = useTranslations("app.team.invite");
  const tr = useTranslations("app.team.roles");
  const tl = useTranslations("app.team.link");
  const [state, action, pending] = useActionState(invite, initial);
  const values = state.done ? undefined : state.values;
  // The avatar fills in as the name is typed, as it will look in the team.
  const [typed, setTyped] = useState(values?.name ?? "");

  if (state.done) {
    const { name, link } = state.done;
    return (
      <div className="flex w-full max-w-xl flex-col">
        <Card tone="hero" padding="none" className="px-5 pt-5 pb-24">
          <h2 className="text-balance font-bold text-xl">
            {t("ready", { name })}
          </h2>
          <p className="mt-1 text-base">{t("readyBody", { name })}</p>
        </Card>
        <Card
          tone="float"
          padding="md"
          className="relative z-10 mx-3 -mt-[68px]"
        >
          <CopyLink
            main
            link={link}
            label={tl("linkFor", { name })}
            hint={tl("hint")}
            copy={tl("copy")}
            copied={tl("copied")}
          />
        </Card>
        <div className="mt-5 flex flex-col gap-1 md:flex-row">
          <Button asChild variant="ghost">
            <Link href={back.href}>{back.label}</Link>
          </Button>
          <Button type="button" variant="ghost" onClick={onAnother}>
            {t("another")}
          </Button>
        </div>
      </div>
    );
  }

  const errors = state.errors ?? {};
  const defaultRole = values?.role || roles[roles.length - 1];

  return (
    <form
      action={action}
      noValidate
      className="flex flex-col gap-6 md:grid md:grid-cols-2 md:items-start md:gap-8"
    >
      <FieldGroup>
        <GroupedField
          name="name"
          label={t("name")}
          placeholder={t("namePlaceholder")}
          autoComplete="off"
          maxLength={TEAM_NAME_MAX}
          defaultValue={values?.name}
          onChange={(event) => setTyped(event.target.value)}
          error={errors.name ? t(`errors.name.${errors.name}`) : undefined}
          leading={<PersonAvatar name={typed} />}
          required
        />
        <GroupedPhoneField
          name="phone"
          label={t("phone")}
          autoComplete="off"
          defaultValue={values?.phone}
          error={errors.phone ? t(`errors.phone.${errors.phone}`) : undefined}
          hint={t("phoneHint")}
          leading={
            <span className="grid size-10 place-items-center rounded-full bg-surface-2 text-ink-2 [&_svg]:size-5">
              <Smartphone />
            </span>
          }
          required
        />
      </FieldGroup>
      <ChoiceList
        legend={t("role")}
        error={errors.role ? t(`errors.role.${errors.role}`) : undefined}
        className="md:row-span-2"
      >
        {roles.map((role) => (
          <ChoiceRow
            key={role}
            name="role"
            value={role}
            defaultChecked={role === defaultRole}
            title={tr(role)}
            hint={t(`roleHint.${role}`)}
          />
        ))}
      </ChoiceList>
      {state.failure ? (
        <p role="alert" className="px-1 text-danger md:col-start-1">
          {t(`errors.${state.failure}`)}
        </p>
      ) : null}
      <div className="md:col-start-1">
        <FloatingAction>
          <Button
            type="submit"
            size="lg"
            loading={pending}
            className={cn(
              "w-full md:w-auto md:shadow-none",
              floatingButtonClass,
            )}
          >
            <Send aria-hidden="true" className="rtl:-scale-x-100" />
            {t("submit")}
          </Button>
        </FloatingAction>
      </div>
    </form>
  );
}
