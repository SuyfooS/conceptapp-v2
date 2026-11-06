"use client";

import {
  firstStepWithError,
  NEW_BUSINESS_STEPS,
  type NewBusinessErrors,
  normalizeSlug,
  parseNewBusiness,
} from "@domain/business";
import { ACCENT_PRESETS, accentTokens } from "@domain/color";
import { displayIsraeliMobile } from "@domain/phone";
import { parseStaffList, type StaffList } from "@domain/staff-list";
import { TEMPLATE_KEYS, type TemplateKey } from "@domain/templates";
import { accentProps } from "@ui/accent";
import { Badge } from "@ui/badge";
import { Button, buttonVariants } from "@ui/button";
import { Card } from "@ui/card";
import { ChoiceList, ChoiceRow } from "@ui/choice-row";
import { cn } from "@ui/cn";
import { FieldGroup, GroupedField, GroupedTextArea } from "@ui/field-group";
import { FloatingAction, floatingButtonClass } from "@ui/floating-action";
import { PersonList, PersonRow } from "@ui/person-row";
import { ltrInputClass } from "@ui/text-field";
import { Coffee, UtensilsCrossed } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  type FormEvent,
  type ReactNode,
  startTransition,
  useActionState,
  useRef,
  useState,
} from "react";
import { BusinessMark } from "../../business-mark";
import type { NewBusinessState } from "./actions";

const STEP_KEYS = ["template", "details", "accent", "staff"] as const;
const LAST_STEP = NEW_BUSINESS_STEPS.length - 1;

const TEMPLATE_ICONS: Record<TemplateKey, ReactNode> = {
  restaurant: <UtensilsCrossed />,
  "cafe-bar": <Coffee />,
};

type Values = {
  template: TemplateKey;
  name: string;
  slug: string;
  address: string;
  accent: string;
  /** The pasted staff list, as typed. */
  staff: string;
};

const initialState: NewBusinessState = {};

/**
 * The new-business wizard: one clear step at a time (kind of business, details,
 * colour, staff list), checked as it goes with the same rules the server runs.
 * Every field stays in the one form, so the last step submits everything. On
 * phones the step's main action floats beside the tab bar and a summary closes
 * the last step; from tablet up the action ends the form and the summary sits
 * beside it.
 */
export function NewBusinessForm({
  create,
}: {
  /** `createBusinessAction`, or the design demo's stand-in. */
  create: (prev: NewBusinessState, form: FormData) => Promise<NewBusinessState>;
}) {
  const t = useTranslations("admin.newBusiness");
  const [state, formAction, pending] = useActionState(create, initialState);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<NewBusinessErrors>({});
  const [values, setValues] = useState<Values>({
    template: "restaurant",
    name: "",
    slug: "",
    address: "",
    accent: ACCENT_PRESETS[0].hex,
    staff: "",
  });
  const stepHeading = useRef<HTMLHeadingElement>(null);

  // A new step is announced by moving focus to its heading once it shows.
  const goTo = (next: number) => {
    setStep(next);
    requestAnimationFrame(() => stepHeading.current?.focus());
  };

  // The server found a problem (a taken slug, usually): go back to it.
  // Adjusted while rendering, so the step and errors change together.
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state.errors) {
      setErrors(state.errors);
      setStep(firstStepWithError(state.errors));
    }
  }

  const set = (field: keyof Values) => (value: string) =>
    setValues((v) => ({ ...v, [field]: value }));

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step < LAST_STEP) {
      const result = parseNewBusiness(values, NEW_BUSINESS_STEPS[step]);
      if (!result.ok) {
        setErrors(result.errors);
        return;
      }
      setErrors({});
      goTo(step + 1);
      return;
    }
    const result = parseNewBusiness(values);
    if (!result.ok) {
      setErrors(result.errors);
      goTo(firstStepWithError(result.errors));
      return;
    }
    setErrors({});
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  }

  const tokens = accentTokens(values.accent);
  const staff = parseStaffList(values.staff);
  const summary = <Summary values={values} staff={staff} />;

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_17rem] md:items-start md:gap-8 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <div className="flex flex-col gap-3">
          <div aria-hidden="true" className="flex gap-1">
            {STEP_KEYS.map((key, i) => (
              <span
                key={key}
                className={cn(
                  "h-1.5 flex-1 rounded-full transition-colors duration-200 ease-calm",
                  i <= step ? "bg-accent" : "bg-surface-2",
                )}
              />
            ))}
          </div>
          <div className="flex flex-col px-1">
            <p className="text-ink-2 text-sm">
              {t("progress", { step: step + 1, total: STEP_KEYS.length })}
            </p>
            <h2
              ref={stepHeading}
              tabIndex={-1}
              className="font-bold text-xl outline-none"
            >
              {t(`steps.${STEP_KEYS[step] ?? "template"}`)}
            </h2>
          </div>
        </div>

        <Step active={step === 0}>
          <ChoiceList
            legend={t("steps.template")}
            legendClassName="sr-only"
            error={
              errors.template
                ? t(`errors.template.${errors.template}`)
                : undefined
            }
          >
            {TEMPLATE_KEYS.map((key) => (
              <ChoiceRow
                key={key}
                name="template"
                value={key}
                checked={values.template === key}
                onChange={() => set("template")(key)}
                leading={TEMPLATE_ICONS[key]}
                title={t(`templates.${key}.name`)}
                hint={t(`templates.${key}.body`)}
              />
            ))}
          </ChoiceList>
        </Step>

        <Step active={step === 1} legend={t("steps.details")}>
          <FieldGroup>
            <GroupedField
              name="name"
              label={t("fields.name.label")}
              placeholder={t("fields.name.placeholder")}
              hint={t("fields.name.hint")}
              error={errors.name && t(`errors.name.${errors.name}`)}
              value={values.name}
              onChange={(e) => set("name")(e.target.value)}
              autoComplete="organization"
              maxLength={120}
              required
            />
            <GroupedField
              name="slug"
              label={t("fields.slug.label")}
              placeholder={t("fields.slug.placeholder")}
              hint={t("fields.slug.hint")}
              error={errors.slug && t(`errors.slug.${errors.slug}`)}
              value={values.slug}
              onChange={(e) => set("slug")(e.target.value)}
              onBlur={(e) => set("slug")(normalizeSlug(e.target.value))}
              dir="ltr"
              className={ltrInputClass}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              maxLength={60}
              required
            />
            <GroupedField
              name="address"
              label={t("fields.address.label")}
              placeholder={t("fields.address.placeholder")}
              hint={t("fields.address.hint")}
              error={errors.address && t(`errors.address.${errors.address}`)}
              value={values.address}
              onChange={(e) => set("address")(e.target.value)}
              autoComplete="street-address"
              maxLength={240}
            />
          </FieldGroup>
        </Step>

        <Step active={step === 2} legend={t("steps.accent")}>
          <input type="hidden" name="accent" value={values.accent} />
          <div {...accentProps(tokens)} className="flex flex-col">
            <Card tone="hero" padding="none" className="px-5 pt-5 pb-[76px]">
              <p className="font-medium text-base">{t("accent.preview")}</p>
              <p className="mt-6 font-bold text-2xl">{values.name}</p>
            </Card>
            <Card
              tone="float"
              padding="md"
              className="relative z-10 mx-3 -mt-14"
            >
              <span
                className={cn(
                  buttonVariants(),
                  "pointer-events-none flex w-full",
                )}
              >
                {t("accent.previewButton")}
              </span>
            </Card>
          </div>
          {tokens.adjusted ? (
            <p className="px-1 text-sm" aria-live="polite">
              {t("accent.adjusted")}
            </p>
          ) : null}
          <div className="rounded-card bg-surface shadow-card">
            <div className="flex flex-wrap gap-1.5 p-3">
              {ACCENT_PRESETS.map((preset) => (
                <label
                  key={preset.key}
                  title={t(`accent.presets.${preset.key}`)}
                  className="group grid size-11 cursor-pointer place-items-center rounded-full has-checked:shadow-[inset_0_0_0_2px_var(--ink)] has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ink"
                >
                  <input
                    type="radio"
                    name="accentPreset"
                    value={preset.hex}
                    checked={values.accent === preset.hex}
                    onChange={() => set("accent")(preset.hex)}
                    className="sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className="size-[30px] rounded-full transition-transform duration-300 ease-spring group-has-checked:scale-[0.82]"
                    style={{ backgroundColor: preset.hex }}
                  />
                  <span className="sr-only">
                    {t(`accent.presets.${preset.key}`)}
                  </span>
                </label>
              ))}
            </div>
            <label className="relative flex min-h-14 cursor-pointer items-center justify-between gap-3 px-4 py-2 before:absolute before:inset-x-4 before:top-0 before:h-px before:bg-line before:content-['']">
              <span className="font-medium">{t("accent.custom")}</span>
              <input
                type="color"
                value={values.accent}
                onChange={(e) => set("accent")(e.target.value.toLowerCase())}
                className="size-9 cursor-pointer appearance-none rounded-full border-0 bg-transparent p-0 [&::-moz-color-swatch]:rounded-full [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
              />
            </label>
          </div>
          {errors.accent ? (
            <p className="px-1 text-danger text-sm">
              {t(`errors.accent.${errors.accent}`)}
            </p>
          ) : null}
        </Step>

        <Step active={step === 3} legend={t("steps.staff")}>
          <FieldGroup>
            <GroupedTextArea
              name="staff"
              label={t("staff.label")}
              hint={t("staff.hint")}
              error={errors.staff && t(`errors.staff.${errors.staff}`)}
              placeholder={t("staff.placeholder")}
              value={values.staff}
              onChange={(e) => {
                set("staff")(e.target.value);
                // The preview shows each problem live; drop the error once
                // the list is fine again.
                if (!parseStaffList(e.target.value).error) {
                  setErrors(({ staff: _, ...rest }) => rest);
                }
              }}
              rows={5}
              spellCheck={false}
            />
          </FieldGroup>
          <StaffPreview staff={staff} />
          <p className="px-1 text-ink-2 text-sm">{t("staff.notSent")}</p>
          <div className="md:hidden">{summary}</div>
        </Step>

        {state.failure ? (
          <p role="alert" className="px-1 text-danger">
            {t(`errors.${state.failure}`)}
          </p>
        ) : null}

        <FloatingAction besideTabBar className="md:mt-1">
          {step > 0 ? (
            <Button
              variant="ghost"
              size="lg"
              disabled={pending}
              className="min-h-16 max-md:glass md:min-h-13 md:bg-surface-2 md:hover:bg-surface-3"
              onClick={() => {
                setErrors({});
                goTo(step - 1);
              }}
            >
              {t("actions.back")}
            </Button>
          ) : null}
          <Button
            type="submit"
            size="lg"
            loading={pending}
            className={cn(
              "min-h-16 flex-1 md:min-h-13 md:min-w-48 md:flex-none md:shadow-none",
              floatingButtonClass,
            )}
          >
            {step === LAST_STEP ? t("actions.create") : t("actions.next")}
          </Button>
        </FloatingAction>
      </form>
      <div className="hidden md:sticky md:top-6 md:block">{summary}</div>
    </div>
  );
}

/** One wizard step. Hidden steps stay in the form so everything submits. */
function Step({
  active,
  legend,
  children,
}: {
  active: boolean;
  /** Names the group for a screen reader; the step's heading shows it. */
  legend?: string;
  children: ReactNode;
}) {
  return (
    <fieldset
      className={cn("flex min-w-0 flex-col gap-4", !active && "hidden")}
    >
      {legend ? <legend className="sr-only">{legend}</legend> : null}
      {children}
    </fieldset>
  );
}

/**
 * The pasted list as it will be invited, with each line that needs fixing
 * named by its number.
 */
function StaffPreview({ staff }: { staff: StaffList }) {
  const t = useTranslations("admin");
  const problems = staff.lines.flatMap((line) => (line.ok ? [] : [line]));
  return (
    <div className="flex flex-col gap-3">
      <p className="px-1 font-semibold" aria-live="polite">
        {problems.length > 0
          ? t("newBusiness.staff.problems", { count: problems.length })
          : t("newBusiness.staff.count", { count: staff.entries.length })}
      </p>
      {problems.length > 0 ? (
        <ul className="flex flex-col gap-1 px-1 text-sm">
          {problems.map((line) => (
            <li key={line.line} className="flex flex-col">
              <span className="text-danger">
                {t("newBusiness.staff.line", { line: line.line })}
                {" · "}
                {t(`newBusiness.staff.lineErrors.${line.error}`)}
              </span>
              <span className="break-words text-ink-2">{line.text}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {staff.entries.length > 0 ? (
        <PersonList aria-label={t("newBusiness.staff.listLabel")}>
          {staff.entries.map((entry) => (
            <PersonRow
              key={entry.phone}
              name={entry.name}
              title={entry.name}
              subtitle={
                <span dir="ltr">{displayIsraeliMobile(entry.phone)}</span>
              }
              trailing={
                <Badge tone={entry.role === "worker" ? "neutral" : "accent"}>
                  {t(`memberRoles.${entry.role}`)}
                </Badge>
              }
            />
          ))}
        </PersonList>
      ) : null}
    </div>
  );
}

/** What has been chosen so far, under the business's own mark. */
function Summary({ values, staff }: { values: Values; staff: StaffList }) {
  const t = useTranslations("admin.newBusiness");
  const empty = <span className="text-ink-2">{t("summary.empty")}</span>;
  const slug = normalizeSlug(values.slug);
  const name = values.name.trim();
  const rows: { label: string; value: ReactNode }[] = [
    {
      label: t("summary.template"),
      value: t(`templates.${values.template}.name`),
    },
    { label: t("summary.name"), value: name || empty },
    {
      label: t("summary.slug"),
      value: slug ? <span dir="ltr">{slug}</span> : empty,
    },
    { label: t("summary.address"), value: values.address.trim() || empty },
    {
      label: t("summary.staff"),
      value: t("staff.count", { count: staff.entries.length }),
    },
  ];
  return (
    <section className="overflow-hidden rounded-card bg-surface shadow-card">
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <BusinessMark name={name || "·"} accent={values.accent} />
        <h2 className="font-bold text-md">{t("summary.title")}</h2>
      </div>
      <dl>
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex justify-between gap-4 border-line border-t px-4 py-2.5 text-base"
          >
            <dt className="shrink-0 text-ink-2">{row.label}</dt>
            <dd className="min-w-0 break-words text-end font-medium">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
