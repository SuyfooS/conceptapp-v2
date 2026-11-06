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
import { Card, CardTitle } from "@ui/card";
import { cn } from "@ui/cn";
import { ltrInputClass, TextArea, TextField } from "@ui/text-field";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  type FormEvent,
  type ReactNode,
  startTransition,
  useActionState,
  useRef,
  useState,
} from "react";
import { createBusinessAction, type NewBusinessState } from "./actions";

const STEP_KEYS = ["template", "details", "accent", "staff"] as const;
const LAST_STEP = NEW_BUSINESS_STEPS.length - 1;

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
 * The new-business wizard: one step at a time (kind of business, details,
 * colour, staff list), checked as it goes with the same rules the server
 * runs. Every field stays in the one form, so the last step submits
 * everything. On desktop a summary sits beside the form; on phones and
 * tablets it closes the last step.
 */
export function NewBusinessForm() {
  const t = useTranslations("admin.newBusiness");
  const [state, formAction, pending] = useActionState(
    createBusinessAction,
    initialState,
  );
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
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
      <form
        onSubmit={onSubmit}
        noValidate
        className="flex flex-col gap-6 md:rounded-card md:bg-surface md:p-6 md:shadow-raised"
      >
        <div className="flex flex-col gap-1">
          <p className="text-ink-2 text-sm">
            {t("progress", { step: step + 1, total: STEP_KEYS.length })}
          </p>
          <h2
            ref={stepHeading}
            tabIndex={-1}
            className="font-bold text-lg outline-none"
          >
            {t(`steps.${STEP_KEYS[step] ?? "template"}`)}
          </h2>
        </div>

        <Step active={step === 0} legend={t("steps.template")}>
          <div className="grid gap-3 md:grid-cols-2">
            {TEMPLATE_KEYS.map((key) => (
              <label
                key={key}
                className={cn(
                  "flex min-h-11 cursor-pointer items-start gap-3 rounded-card border border-line bg-surface p-4",
                  "transition-colors duration-150 ease-calm has-checked:border-accent has-checked:ring-1 has-checked:ring-accent",
                )}
              >
                <input
                  type="radio"
                  name="template"
                  value={key}
                  checked={values.template === key}
                  onChange={() => set("template")(key)}
                  className="mt-0.5 size-5 shrink-0 accent-accent"
                />
                <span className="flex flex-col gap-1">
                  <span className="font-medium">
                    {t(`templates.${key}.name`)}
                  </span>
                  <span className="text-ink-2 text-sm">
                    {t(`templates.${key}.body`)}
                  </span>
                </span>
              </label>
            ))}
          </div>
          {errors.template ? (
            <p className="text-danger text-sm">
              {t(`errors.template.${errors.template}`)}
            </p>
          ) : (
            <p className="text-ink-2 text-sm">{t("templateHint")}</p>
          )}
        </Step>

        <Step active={step === 1} legend={t("steps.details")}>
          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              name="name"
              label={t("fields.name.label")}
              hint={t("fields.name.hint")}
              error={errors.name && t(`errors.name.${errors.name}`)}
              value={values.name}
              onChange={(e) => set("name")(e.target.value)}
              autoComplete="organization"
              maxLength={120}
              required
            />
            <TextField
              name="slug"
              label={t("fields.slug.label")}
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
          </div>
          <TextField
            name="address"
            label={t("fields.address.label")}
            hint={t("fields.address.hint")}
            error={errors.address && t(`errors.address.${errors.address}`)}
            value={values.address}
            onChange={(e) => set("address")(e.target.value)}
            autoComplete="street-address"
            maxLength={240}
          />
        </Step>

        <Step active={step === 2} legend={t("steps.accent")}>
          <input type="hidden" name="accent" value={values.accent} />
          <div className="flex flex-wrap items-center gap-3">
            {ACCENT_PRESETS.map((preset) => (
              <label
                key={preset.key}
                title={t(`accent.presets.${preset.key}`)}
                className="flex size-11 cursor-pointer items-center justify-center rounded-full has-checked:ring-2 has-checked:ring-ink has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ink"
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
                  className="size-9 rounded-full border border-line"
                  style={{ backgroundColor: preset.hex }}
                />
                <span className="sr-only">
                  {t(`accent.presets.${preset.key}`)}
                </span>
              </label>
            ))}
            <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-control border border-line bg-surface ps-1.5 pe-3 text-sm">
              <input
                type="color"
                value={values.accent}
                onChange={(e) => set("accent")(e.target.value.toLowerCase())}
                className="size-8 cursor-pointer rounded-control border-0 bg-transparent p-0"
              />
              {t("accent.custom")}
            </label>
          </div>
          {errors.accent ? (
            <p className="text-danger text-sm">
              {t(`errors.accent.${errors.accent}`)}
            </p>
          ) : null}
          <div
            {...accentProps(tokens)}
            className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4"
          >
            <p className="text-ink-2 text-sm">{t("accent.preview")}</p>
            <span
              className={cn(buttonVariants(), "pointer-events-none self-start")}
            >
              {t("accent.previewButton")}
            </span>
            {tokens.adjusted ? (
              <p className="text-sm" aria-live="polite">
                {t("accent.adjusted")}
              </p>
            ) : null}
          </div>
        </Step>

        <Step active={step === 3} legend={t("steps.staff")}>
          <TextArea
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
            rows={6}
            spellCheck={false}
          />
          <StaffPreview staff={staff} />
          <p className="text-ink-2 text-sm">{t("staff.notSent")}</p>
          <div className="xl:hidden">{summary}</div>
        </Step>

        {state.failure ? (
          <p role="alert" className="text-danger">
            {t(`errors.${state.failure}`)}
          </p>
        ) : null}

        <div className="flex flex-col gap-2 md:flex-row-reverse md:justify-between">
          <Button
            type="submit"
            size="lg"
            loading={pending}
            className="md:min-w-40"
          >
            {step === LAST_STEP ? t("actions.create") : t("actions.next")}
          </Button>
          {step === 0 ? (
            <Button asChild variant="ghost" size="lg">
              <Link href="/admin">{t("actions.cancel")}</Link>
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="lg"
              disabled={pending}
              onClick={() => {
                setErrors({});
                goTo(step - 1);
              }}
            >
              {t("actions.back")}
            </Button>
          )}
        </div>
      </form>
      <div className="hidden xl:block">{summary}</div>
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
  legend: string;
  children: ReactNode;
}) {
  return (
    <fieldset
      className={cn("flex min-w-0 flex-col gap-4", !active && "hidden")}
    >
      <legend className="sr-only">{legend}</legend>
      {children}
    </fieldset>
  );
}

/**
 * The pasted list as it will be invited, with each line that needs fixing
 * named by its number. Phone: one column; tablet and up: two.
 */
function StaffPreview({ staff }: { staff: StaffList }) {
  const t = useTranslations("admin");
  const problems = staff.lines.flatMap((line) => (line.ok ? [] : [line]));
  return (
    <div className="flex flex-col gap-3">
      <p className="font-medium" aria-live="polite">
        {problems.length > 0
          ? t("newBusiness.staff.problems", { count: problems.length })
          : t("newBusiness.staff.count", { count: staff.entries.length })}
      </p>
      {problems.length > 0 ? (
        <ul className="flex flex-col gap-1 text-sm">
          {problems.map((line) => (
            <li key={line.line} className="flex flex-col">
              <span className="text-danger">
                {t("newBusiness.staff.line", { line: line.line })}
                {" · "}
                {t(`newBusiness.staff.lineErrors.${line.error}`)}
              </span>
              <span className="truncate text-ink-2">{line.text}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {staff.entries.length > 0 ? (
        <ul
          aria-label={t("newBusiness.staff.listLabel")}
          className="grid gap-2 md:grid-cols-2"
        >
          {staff.entries.map((entry) => (
            <li
              key={entry.phone}
              className="flex min-h-11 items-center justify-between gap-3 rounded-control border border-line bg-surface px-3 py-2"
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{entry.name}</span>
                <span className="text-ink-2 text-sm">
                  <span dir="ltr">{displayIsraeliMobile(entry.phone)}</span>
                </span>
              </span>
              <Badge tone={entry.role === "worker" ? "neutral" : "accent"}>
                {t(`memberRoles.${entry.role}`)}
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** What has been chosen so far. */
function Summary({ values, staff }: { values: Values; staff: StaffList }) {
  const t = useTranslations("admin.newBusiness");
  const empty = <span className="text-ink-2">{t("summary.empty")}</span>;
  const slug = normalizeSlug(values.slug);
  const rows: { label: string; value: ReactNode }[] = [
    {
      label: t("summary.template"),
      value: t(`templates.${values.template}.name`),
    },
    { label: t("summary.name"), value: values.name.trim() || empty },
    {
      label: t("summary.slug"),
      value: slug ? <span dir="ltr">{slug}</span> : empty,
    },
    { label: t("summary.address"), value: values.address.trim() || empty },
    {
      label: t("summary.accent"),
      value: (
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="size-5 rounded-full border border-line"
            style={{ backgroundColor: accentTokens(values.accent).accent }}
          />
          <span dir="ltr">{accentTokens(values.accent).accent}</span>
        </span>
      ),
    },
    {
      label: t("summary.staff"),
      value: t("staff.count", { count: staff.entries.length }),
    },
  ];
  return (
    <Card tone="flat" padding="lg" className="flex flex-col gap-3">
      <CardTitle as="h2">{t("summary.title")}</CardTitle>
      <dl className="flex flex-col gap-2">
        {rows.map((row) => (
          <div key={row.label} className="flex justify-between gap-4">
            <dt className="text-ink-2">{row.label}</dt>
            <dd className="min-w-0 text-end font-medium break-words">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
