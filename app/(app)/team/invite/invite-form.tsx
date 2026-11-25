"use client";

import type { Role } from "@domain/modules";
import { type NamedRole, namedRoleName } from "@domain/role-access";
import {
  type InviteChoice,
  type RoleChoice,
  roleChoiceKey,
  TEAM_NAME_MAX,
} from "@domain/team";
import { announce } from "@ui/announcer";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { ChoiceList, ChoiceRow } from "@ui/choice-row";
import { cn } from "@ui/cn";
import { FieldGroup, GroupedField, GroupedPhoneField } from "@ui/field-group";
import { FloatingAction, floatingButtonClass } from "@ui/floating-action";
import { arrived, focusFirst } from "@ui/focus-after";
import { PersonAvatar } from "@ui/person-row";
import { Send, Smartphone } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useLayoutEffect, useRef, useState } from "react";
import { CopyLink } from "@/app/copy-link";
import {
  answerHeard,
  useAnswerCount,
  useQuietWhy,
} from "../../../(auth)/step-results";
import type { InviteState } from "../actions";
import { firstRefused, refusedAt } from "./invite-answer";

const initial: InviteState = {};

/**
 * Invite someone by phone: name, mobile and role, then the link to send
 * on. `roles` are the ones the signed-in person may give, most senior
 * first, each role the business named after the role it is built on (the
 * roles plan's R11b), by its name with its base under it; the default is a
 * worker, the usual case. A role only an owner gives (`blocked`: it holds
 * pay, or a named role holding more than they do) is shown, not offered,
 * with why, as the role sheet on a person's page shows it.
 */
type InviteFormProps = {
  roles: readonly InviteChoice[];
  /** The names of the business's named roles among `roles`; none by default. */
  namedRoles?: readonly NamedRole[];
  /** Where "back" goes once the link is ready: the team, or the console's business. */
  back: { href: string; label: string };
  /** The role picked to start with; a worker otherwise, when `roles` has one. */
  defaultRole?: Role;
  /** `inviteAction`, or the design demo's stand-in. */
  invite: (prev: InviteState, form: FormData) => Promise<InviteState>;
};

export function InviteForm(props: InviteFormProps) {
  // "Invite someone else" starts over with a fresh form and state.
  const [round, setRound] = useState(0);
  return (
    <InviteRound
      key={round}
      {...props}
      again={round > 0}
      onAnother={() => setRound(round + 1)}
    />
  );
}

/**
 * One invite, from the form to its link. Each answer is heard: the link
 * ready takes the focus to its card's title, which says so, from the press
 * that went with the form (with the focus put elsewhere, the announcer says
 * it); a field refused (the name, the number) takes the
 * focus that was in the form, the first of them, read as invalid, and why
 * is said once, through the announcer, as sign-in's number is
 * (`answerHeard`); any other refusal is a line of its own, drawn anew each
 * time, and the press takes back the focus it lost. Never the focus from
 * where the person put it outside the form. `again`: started over from
 * "הזמנה של מישהו נוסף", which went, so the name takes the focus.
 */
function InviteRound({
  roles,
  namedRoles = [],
  back,
  defaultRole: startRole,
  invite,
  again,
  onAnother,
}: InviteFormProps & { again: boolean; onAnother: () => void }) {
  const t = useTranslations("app.team.invite");
  const tr = useTranslations("app.team.roles");
  const tl = useTranslations("app.team.link");
  const tc = useTranslations("app.team.changes");
  const locale = useLocale();
  const namedOf = (choice: RoleChoice) =>
    namedRoles.find((role) => role.id === choice.namedRole) ?? null;
  const [state, action, pending] = useActionState(invite, initial);
  const values = state.done ? undefined : state.values;
  // The avatar fills in as the name is typed, as it will look in the team.
  const [typed, setTyped] = useState(values?.name ?? "");
  const errors = (state.done ? undefined : state.errors) ?? {};
  const nameError = errors.name ? t(`errors.name.${errors.name}`) : undefined;
  const phoneError = errors.phone
    ? t(`errors.phone.${errors.phone}`)
    : undefined;
  const answer = useAnswerCount(state);
  const nameField = useRef<HTMLInputElement>(null);
  const phoneField = useRef<HTMLInputElement>(null);
  const submit = useRef<HTMLButtonElement>(null);
  const ready = useRef<HTMLHeadingElement>(null);
  const { quiet: nameQuiet, hush: hushName } = useQuietWhy(nameField);
  const { quiet: phoneQuiet, hush: hushPhone } = useQuietWhy(phoneField);
  // The state it starts with is no answer.
  const seen = useRef<InviteState | null>(state);

  // Started over: the name, to write the next one at once. Once, as the
  // round is drawn, not when the screen is shown again.
  const started = useRef(false);
  useLayoutEffect(() => {
    if (started.current) return;
    started.current = true;
    if (again) focusFirst([nameField.current], { title: false });
  }, [again]);

  // Each answer once, as it arrives (`arrived`: not when the screen is
  // shown again). In the drawing's own pass, so a field that keeps the
  // focus is drawn without why in its description.
  useLayoutEffect(() => {
    if (!arrived(seen, state)) return;
    if (state.done) {
      // Its title says so as it takes the focus; with the focus put
      // elsewhere meanwhile, the announcer says it there.
      if (!focusFirst([ready.current])) {
        announce(t("ready", { name: state.done.name }));
      }
      return;
    }
    const refused = firstRefused(state.errors);
    if (!refused) {
      // The role's line or the refusal's says it, as an alert, each drawn
      // anew for each answer.
      focusFirst([submit.current], { title: false });
      return;
    }
    const onName = refused === "name";
    const field = (onName ? nameField : phoneField).current;
    const why = onName ? nameError : phoneError;
    if (!field || !why) return;
    const said = answerHeard({ error: why, at: refusedAt(field) });
    if (said.focus) field.focus();
    if (said.say) announce(said.say.words, { politeness: said.say.politeness });
    if (said.quiet) (onName ? hushName : hushPhone)(answer);
  }, [state, t, nameError, phoneError, answer, hushName, hushPhone]);

  if (state.done) {
    const { name, link } = state.done;
    return (
      <div className="flex w-full max-w-xl flex-col">
        <Card tone="hero" padding="none" className="px-5 pt-5 pb-24">
          <h2
            ref={ready}
            tabIndex={-1}
            className="text-balance font-bold text-xl outline-none"
          >
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

  // Only a role offered starts chosen.
  const keys = roles.filter((choice) => !choice.blocked).map(roleChoiceKey);
  // A worker, never "the last role": an owner's list ends with an accountant.
  const defaultRole =
    values?.role ||
    startRole ||
    (keys.includes("worker") ? "worker" : keys[keys.length - 1]);

  return (
    <form
      action={action}
      noValidate
      className="flex flex-col gap-6 md:grid md:grid-cols-2 md:items-start md:gap-8"
    >
      <FieldGroup>
        <GroupedField
          ref={nameField}
          name="name"
          label={t("name")}
          placeholder={t("namePlaceholder")}
          autoComplete="off"
          maxLength={TEAM_NAME_MAX}
          defaultValue={values?.name}
          onChange={(event) => setTyped(event.target.value)}
          error={nameError}
          quietMessage={nameQuiet === answer}
          leading={<PersonAvatar name={typed} />}
          required
        />
        <GroupedPhoneField
          ref={phoneField}
          name="phone"
          label={t("phone")}
          autoComplete="off"
          defaultValue={values?.phone}
          error={phoneError}
          quietMessage={phoneQuiet === answer}
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
        error={
          errors.role ? (
            // Its words drawn anew for each answer, in the list's alert, so
            // the same refusal again is heard.
            <span key={answer}>{t(`errors.role.${errors.role}`)}</span>
          ) : undefined
        }
        className="md:row-span-2"
      >
        {roles.map((choice) => {
          const key = roleChoiceKey(choice);
          const named = namedOf(choice);
          return (
            <ChoiceRow
              key={key}
              name="role"
              value={key}
              defaultChecked={!choice.blocked && key === defaultRole}
              disabled={Boolean(choice.blocked)}
              title={named ? namedRoleName(named, locale) : tr(choice.role)}
              hint={
                choice.blocked === "pay"
                  ? tc("payHint")
                  : choice.blocked === "held"
                    ? tc("heldHint")
                    : named
                      ? t("namedHint", { role: tr(choice.role) })
                      : t(`roleHint.${choice.role}`)
              }
            />
          );
        })}
      </ChoiceList>
      {state.failure ? (
        // Drawn anew for each answer, so the same refusal again is heard.
        <p
          key={answer}
          role="alert"
          className="px-1 text-danger md:col-start-1"
        >
          {t(`errors.${state.failure}`)}
        </p>
      ) : null}
      <div className="md:col-start-1">
        <FloatingAction>
          <Button
            ref={submit}
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
