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
} from "../flow-kit";

/**
 * Step 0, "איך לפנות אליך": the language the file speaks and the form the
 * app writes about the person in, both on the profile, so the rest of the
 * flow speaks to them rightly from the next step on. English turns the flow
 * and its notice to English at once; the rest of the app stays Hebrew.
 */
export function StartStep({ kit, active }: { kit: Kit; active: boolean }) {
  const { t, data } = kit;
  const formId = useId();
  const [locale, setLocale] = useState<ProfileLocale>(data.locale);
  const [form, setForm] = useState<AddressForm | null>(data.addressForm);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form || pending) return;
    setPending(true);
    setFailed(false);
    const result = await kit.actions
      .saveProfile({ addressForm: form, locale })
      .catch(() => ({ ok: false }) as const);
    setPending(false);
    if (!result.ok) {
      setFailed(true);
      return;
    }
    kit.say(t("saved"));
    if (active) kit.go(nextFileStep("start") ?? "done");
  }

  return (
    <FileSection step="start" active={active} kit={kit}>
      <form id={formId} onSubmit={save} className="flex flex-col gap-6">
        <ChoiceList
          legend={t("start.language")}
          note={t("start.languageNote")}
          legendClassName="text-md"
        >
          <ChoiceRow
            name={`${formId}-locale`}
            title={<span lang="he">{t("start.he")}</span>}
            checked={locale === "he"}
            onChange={() => setLocale("he")}
          />
          <ChoiceRow
            name={`${formId}-locale`}
            title={<span lang="en">{t("start.en")}</span>}
            checked={locale === "en"}
            onChange={() => setLocale("en")}
          />
        </ChoiceList>
        <div className="flex flex-col gap-2">
          <ChoiceList legend={t("start.form")} legendClassName="text-md">
            {ADDRESS_FORMS.map((option) => (
              <ChoiceRow
                key={option}
                name={`${formId}-form`}
                title={t(`start.${option}`)}
                checked={form === option}
                onChange={() => setForm(option)}
              />
            ))}
          </ChoiceList>
          <Reason>{t("start.formNote")}</Reason>
        </div>
        <Failure>{failed ? t("failures.failed") : null}</Failure>
        <div className="hidden xl:flex">
          <Button
            type="submit"
            variant="secondary"
            loading={pending}
            disabled={!form}
          >
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
