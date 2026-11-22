"use client";

import { birthDateSchema } from "@domain/employee-file";
import { minorOnFile, nextFileStep } from "@domain/employee-file-steps";
import {
  type Country,
  type IdKind,
  ISO_COUNTRIES,
  normalizeDocumentNumber,
} from "@domain/identity-documents";
import { isIsraeliId } from "@domain/israeli-id";
import {
  type DateParts,
  datePartsOf,
  isEmptyDate,
  isShortYear,
  parseTypedDate,
} from "@domain/typed-date";
import { cleanTyped, tidyLine } from "@domain/typed-text";
import { Button } from "@ui/button";
import { Card, CardText, CardTitle } from "@ui/card";
import { ChoiceList, ChoiceRow } from "@ui/choice-row";
import { CountryField } from "@ui/country-field";
import { DateField } from "@ui/date-field";
import { IdField } from "@ui/id-field";
import { MaskedValue } from "@ui/masked-value";
import { TextField } from "@ui/text-field";
import { type FormEvent, useId, useState } from "react";
import { failureKey } from "../failure-words";
import type { FileActionFailure } from "../file-types";
import {
  Failure,
  FileSection,
  firstProblem,
  type Kit,
  LaterLink,
  Reason,
  StepDock,
  showFirstProblem,
  useDay,
} from "../flow-kit";

const KINDS = ["il", "passport", "other"] as const satisfies readonly IdKind[];

/** A typed day, YYYY-MM-DD, or null while it isn't one (or is empty). */
const typedDay = (parts: DateParts) => {
  const typed = parseTypedDate(parts);
  return typed.ok ? typed.date : null;
};

/** Whether all three parts of a date are typed in full, so it can be judged. */
const complete = (parts: DateParts) =>
  parts.day !== "" && parts.month !== "" && parts.year.length === 4;

/** Whether one of the three parts is still empty: the date is missing, not wrong. */
const partEmpty = (parts: DateParts) =>
  [parts.day, parts.month, parts.year].some(
    (part) => cleanTyped(part).trim() === "",
  );

/**
 * Step 1, "הפרטים שלך כמו בתעודה": the document (an Israeli ID, a passport
 * or another), its number, the names exactly as on it and the birth date.
 * The names start empty, to be typed as the document has them. A saved
 * number shows as its last digits, with "הצגה" for the person's own eyes,
 * and "תיקון" types a new one; left empty, the saved one stays. As soon as
 * the birth date says the person is under 18 today, the card about the
 * medical certificate shows, before anything is saved. A date with every
 * part typed is judged once it is full or left ("1/1/95" says the year has
 * four digits); with nothing missing the main action can be pressed, and a
 * press that can't save says every problem and goes to the first.
 */
export function IdentityStep({ kit, active }: { kit: Kit; active: boolean }) {
  const { t, data } = kit;
  const day = useDay();
  const formId = useId();
  const file = data.file;
  const [kind, setKind] = useState<IdKind>(file?.id_kind ?? "il");
  // A saved number is retyped only when asked to, or for another kind.
  const [retype, setRetype] = useState(!file?.has.id);
  const [number, setNumber] = useState("");
  const [country, setCountry] = useState<Country | null>(
    ISO_COUNTRIES.find((code) => code === file?.id_country) ?? null,
  );
  const [expires, setExpires] = useState<DateParts>(
    datePartsOf(file?.id_expires_on ?? null),
  );
  const [documentName, setDocumentName] = useState(data.documentName ?? "");
  const [first, setFirst] = useState(file?.legal_first_name ?? "");
  const [last, setLast] = useState(file?.legal_last_name ?? "");
  const [birth, setBirth] = useState<DateParts>(
    datePartsOf(file?.birth_date ?? null),
  );
  // A date is judged once the focus leaves its three fields.
  const [birthLeft, setBirthLeft] = useState(false);
  const [expiresLeft, setExpiresLeft] = useState(false);
  const [tried, setTried] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<FileActionFailure | null>(null);
  // A change that makes this year's 101 due again: said, and the step stays.
  const [changeDueBy, setChangeDueBy] = useState<string | null>(null);

  // What is wrong, field by field, once it can be judged: whether it is
  // wrong doesn't wait, only saying so does.
  const dateWords = (parts: DateParts, invalid: string) =>
    isShortYear(parts) ? t("date.yearShort") : invalid;
  const birthDay = typedDay(birth);
  const birthCheck = birthDateSchema(data.today).safeParse(birth);
  const birthError =
    !isEmptyDate(birth) &&
    (complete(birth) || tried || (birthLeft && !partEmpty(birth)))
      ? birthDay === null
        ? dateWords(birth, t("identity.birthInvalid"))
        : !birthCheck.success
          ? t("identity.birthRange")
          : null
      : null;
  const numberOk =
    !retype ||
    number === "" ||
    (kind === "il"
      ? isIsraeliId(number)
      : normalizeDocumentNumber(number) !== null);
  const numberError = numberOk
    ? null
    : kind === "il"
      ? number.length === 9 || tried
        ? t("identity.idInvalid")
        : null
      : t("identity.documentInvalid");
  const expiresDay = typedDay(expires);
  const expiresOk =
    kind === "il" ||
    isEmptyDate(expires) ||
    (expiresDay !== null &&
      expiresDay >= "2000-01-01" &&
      expiresDay <= "2100-12-31");
  const expiresError =
    !expiresOk &&
    (complete(expires) || tried || (expiresLeft && !partEmpty(expires)))
      ? dateWords(expires, t("identity.expiresInvalid"))
      : null;

  // A number kept as saved, of the same kind, may stay as it is: the
  // document goes again only with a number typed.
  const storedSameKind =
    Boolean(file?.has.id) && kind === (file?.id_kind ?? null);
  const sendsDocument = retype && (number !== "" || !storedSameKind);
  // Required and still empty, for the main action's words.
  const empty = [
    tidyLine(first) === "",
    tidyLine(last) === "",
    partEmpty(birth),
    sendsDocument && number === "",
    sendsDocument && kind === "passport" && country === null,
    sendsDocument && kind === "other" && tidyLine(documentName).length < 2,
  ].filter(Boolean).length;
  const ready = empty === 0 && birthCheck.success && numberOk && expiresOk;
  const minor = birthCheck.success && minorOnFile(birthCheck.data, data.today);

  function changeKind(next: IdKind) {
    setKind(next);
    if (next !== (file?.id_kind ?? null)) setRetype(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTried(true);
    if (pending) return;
    const form = event.currentTarget;
    if (!ready || firstProblem(form)) {
      showFirstProblem(form);
      return;
    }
    setPending(true);
    setFailure(null);
    const identity = !sendsDocument
      ? undefined
      : kind === "il"
        ? { kind, number }
        : kind === "passport"
          ? {
              kind,
              number,
              country,
              ...(expiresDay ? { expiresOn: expiresDay } : {}),
            }
          : {
              kind,
              name: documentName,
              number,
              ...(country ? { country } : {}),
              ...(expiresDay ? { expiresOn: expiresDay } : {}),
            };
    const result = await kit.actions
      .saveStep("identity", {
        names: { first, last },
        birthDate: birth,
        ...(identity ? { identity } : {}),
      })
      .catch(() => ({ ok: false, failure: "failed" }) as const);
    setPending(false);
    if (!result.ok) {
      setFailure(result.failure);
      return;
    }
    setNumber("");
    setRetype(false);
    setTried(false);
    setChangeDueBy(result.changeDueBy);
    kit.say(t("saved"));
    if (active && !result.changeDueBy) {
      kit.go(nextFileStep("identity") ?? "done");
    }
  }

  const numberLabel =
    kind === "il"
      ? t("identity.idNumber")
      : kind === "passport"
        ? t("identity.passportNumber")
        : t("identity.otherNumber");
  const failureWords = failure ? t(`failures.${failureKey(failure)}`) : null;

  return (
    <FileSection step="identity" active={active} kit={kit}>
      <form
        id={formId}
        onSubmit={save}
        noValidate
        className="flex flex-col gap-5"
      >
        <ChoiceList legend={t("identity.kind")} legendClassName="text-md">
          {KINDS.map((option) => (
            <ChoiceRow
              key={option}
              name={`${formId}-kind`}
              title={t(`identity.${option}`)}
              checked={kind === option}
              onChange={() => changeKind(option)}
            />
          ))}
        </ChoiceList>

        <Card padding="lg" className="flex flex-col gap-4">
          {retype ? (
            <>
              {kind === "other" ? (
                <TextField
                  label={t("identity.otherName")}
                  hint={t("identity.otherNameHint")}
                  value={documentName}
                  onChange={(event) => setDocumentName(event.target.value)}
                  autoComplete="off"
                />
              ) : null}
              <IdField
                label={numberLabel}
                kind={kind === "il" ? "il" : "document"}
                value={number}
                onChange={setNumber}
                error={numberError}
                hint={
                  file?.has.id && kind === (file.id_kind ?? null)
                    ? t("identity.keepStored")
                    : undefined
                }
              />
              {kind !== "il" ? (
                <>
                  <CountryField
                    label={
                      kind === "other"
                        ? t("optionalField", { field: t("identity.country") })
                        : t("identity.country")
                    }
                    locale={data.locale}
                    value={country}
                    onChange={setCountry}
                    emptyText={t("identity.countryNone")}
                    unpickedText={t("identity.countryUnpicked")}
                    placeholder={t("search.placeholder")}
                  />
                  <DateField
                    label={t("optionalField", { field: t("identity.expires") })}
                    parts={{
                      day: t("date.day"),
                      month: t("date.month"),
                      year: t("date.year"),
                    }}
                    value={expires}
                    onChange={setExpires}
                    onBlur={() => setExpiresLeft(true)}
                    error={expiresError}
                  />
                </>
              ) : null}
            </>
          ) : data.masked.id ? (
            <div className="flex flex-col gap-2">
              <MaskedValue
                label={numberLabel}
                masked={data.masked.id}
                onReveal={async () => {
                  const answer = await kit.actions.reveal("id");
                  return answer.ok ? answer.value : null;
                }}
                showLabel={t("masked.show")}
                hideLabel={t("masked.hide")}
                hiddenLabel={t("masked.hidden", { what: numberLabel })}
                failedLabel={t("masked.failed")}
              />
              <Button
                variant="ghost"
                onClick={() => setRetype(true)}
                className="self-start text-ink-2"
              >
                {t("actions.edit")}
              </Button>
            </div>
          ) : null}
          <Reason>{t("identity.idReason")}</Reason>
        </Card>

        <Card padding="lg" className="flex flex-col gap-4">
          <TextField
            label={t("identity.firstName")}
            value={first}
            onChange={(event) => setFirst(event.target.value)}
            autoComplete="given-name"
          />
          <TextField
            label={t("identity.lastName")}
            value={last}
            onChange={(event) => setLast(event.target.value)}
            autoComplete="family-name"
          />
          <Reason>{t("identity.namesReason")}</Reason>
        </Card>

        <Card padding="lg" className="flex flex-col gap-4">
          <DateField
            label={t("identity.birthDate")}
            parts={{
              day: t("date.day"),
              month: t("date.month"),
              year: t("date.year"),
            }}
            value={birth}
            onChange={setBirth}
            onBlur={() => setBirthLeft(true)}
            error={birthError}
            autoComplete="bday"
          />
          <Reason>{t("identity.birthReason")}</Reason>
        </Card>

        {minor ? (
          <Card
            tone="accent"
            padding="lg"
            role="status"
            className="flex flex-col gap-1"
          >
            <CardTitle>{t("identity.minorTitle")}</CardTitle>
            <CardText className="text-ink">
              {t("identity.minorBody", { business: data.businessName })}
            </CardText>
          </Card>
        ) : null}

        {changeDueBy ? (
          <p role="status" className="px-1 font-medium text-base">
            {t("identity.changeDue", { date: day(changeDueBy) })}
          </p>
        ) : null}

        <Failure>{failureWords}</Failure>
        {tried && empty > 0 ? (
          <p role="status" className="hidden px-1 text-base xl:block">
            {t("missingRequired", { count: empty })}
          </p>
        ) : null}
        <div className="hidden xl:flex">
          <Button type="submit" variant="secondary" loading={pending}>
            {t("actions.saveIdentity")}
          </Button>
        </div>
      </form>
      <LaterLink kit={kit} />
      {active ? (
        <StepDock
          kit={kit}
          step="identity"
          main={{
            label: t("actions.next"),
            form: formId,
            // Something missing is said above it; anything else, once pressed.
            disabled: empty > 0,
            pending,
          }}
          notice={empty > 0 ? t("missingRequired", { count: empty }) : null}
        />
      ) : null}
    </FileSection>
  );
}
