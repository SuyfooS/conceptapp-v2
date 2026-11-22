"use client";

import { nextFileStep } from "@domain/employee-file-steps";
import {
  ADDRESS_FORMS,
  type AddressForm,
  type ProfileLocale,
} from "@domain/profile";
import { Button } from "@ui/button";
import { ChoiceList, ChoiceRow } from "@ui/choice-row";
import { type FormEvent, useId, useState } from "react";
import {
  Failure,
  FileSection,
  type Kit,
  LaterLink,
  Reason,
  StepDock,
  showFirstProblem,
} from "../flow-kit";
import { localeToSave } from "../flow-rules";

/**
 * Step 0, "איך לפנות אליך": the language the file speaks and the form the
 * app writes about the person in, both on the profile, so the rest of the
 * flow speaks to them rightly from the next step on. English turns the flow
 * and its notice to English at once; the rest of the app stays Hebrew. The
 * language shown is the file's own until one is picked here, and again
 * once the language button above changes it: step 0 saves a language only
 * when one picked here differs, so it never takes the file back.
 */
export function StartStep({ kit, active }: { kit: Kit; active: boolean }) {
  const { t, data } = kit;
  const formId = useId();
  const [picked, setPicked] = useState<ProfileLocale | null>(null);
  // The file's language changed (the button above, or this step's save):
  // what was picked here is behind it now, and the choice follows the file.
  const [seen, setSeen] = useState(data.locale);
  if (seen !== data.locale) {
    setSeen(data.locale);
    setPicked(null);
  }
  const locale = picked ?? data.locale;
  const [form, setForm] = useState<AddressForm | null>(data.addressForm);
  const [tried, setTried] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTried(true);
    if (pending) return;
    if (!form) {
      showFirstProblem(event.currentTarget);
      return;
    }
    const changed = localeToSave(picked, data.locale);
    setPending(true);
    setFailed(false);
    const result = await kit.actions
      .saveProfile({
        addressForm: form,
        ...(changed ? { locale: changed } : {}),
      })
      .catch(() => ({ ok: false }) as const);
    setPending(false);
    if (!result.ok) {
      setFailed(true);
      return;
    }
    setTried(false);
    kit.say(t("saved"));
    if (active) kit.go(nextFileStep("start") ?? "done", changed ?? undefined);
    else if (changed) kit.showLocale(changed);
  }

  const missing = tried && !form;

  return (
    <FileSection step="start" active={active} kit={kit}>
      <form
        id={formId}
        onSubmit={save}
        noValidate
        className="flex flex-col gap-6"
      >
        <ChoiceList
          legend={t("start.language")}
          note={t("start.languageNote")}
          legendClassName="text-md"
        >
          <ChoiceRow
            name={`${formId}-locale`}
            title={<span lang="he">{t("start.he")}</span>}
            checked={locale === "he"}
            onChange={() => setPicked("he")}
          />
          <ChoiceRow
            name={`${formId}-locale`}
            title={<span lang="en">{t("start.en")}</span>}
            checked={locale === "en"}
            onChange={() => setPicked("en")}
          />
        </ChoiceList>
        <div className="flex flex-col gap-2">
          <ChoiceList legend={t("start.form")} legendClassName="text-md">
            {ADDRESS_FORMS.map((option, at) => (
              <ChoiceRow
                key={option}
                name={`${formId}-form`}
                title={t(`start.${option}`)}
                checked={form === option}
                onChange={() => setForm(option)}
                // A press without a choice comes here.
                aria-invalid={missing && at === 0 ? true : undefined}
              />
            ))}
          </ChoiceList>
          <Reason>{t("start.formNote")}</Reason>
        </div>
        <Failure>{failed ? t("failures.failed") : null}</Failure>
        {missing ? (
          <p role="status" className="hidden px-1 text-base xl:block">
            {t("missingRequired", { count: 1 })}
          </p>
        ) : null}
        <div className="hidden xl:flex">
          <Button type="submit" variant="secondary" loading={pending}>
            {t("actions.saveStart")}
          </Button>
        </div>
      </form>
      <LaterLink kit={kit} />
      {active ? (
        <StepDock
          kit={kit}
          step="start"
          main={{
            label: t("actions.next"),
            form: formId,
            disabled: !form,
            pending,
          }}
          notice={form ? null : t("missingRequired", { count: 1 })}
        />
      ) : null}
    </FileSection>
  );
}
