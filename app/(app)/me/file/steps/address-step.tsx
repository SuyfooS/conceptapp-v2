"use client";

import {
  ADDRESS_TEXT_MAX,
  APARTMENT_MAX,
  addressProblems,
  addressSchema,
  ZIP_DIGITS,
} from "@domain/address";
import type { City } from "@domain/cities";
import { FILE_TEXT_MAX } from "@domain/employee-file";
import { formatIsraeliMobile } from "@domain/phone";
import { CONTROL_OR_BREAK, tidyLine } from "@domain/typed-text";
import { Button } from "@ui/button";
import { Card, CardTitle } from "@ui/card";
import { CityField } from "@ui/city-field";
import { PhoneField, type PhoneValue } from "@ui/phone-field";
import { Segmented } from "@ui/segmented";
import { Switch } from "@ui/switch";
import { ltrInputClass, TextField } from "@ui/text-field";
import { VisibilityNote } from "@ui/visibility-note";
import { type FormEvent, useId, useState } from "react";
import { z } from "zod";
import { failureKey } from "../failure-words";
import type { FileActionFailure } from "../file-types";
import {
  Failure,
  FileSection,
  firstProblem,
  formIdOf,
  type Kit,
  LaterLink,
  ltr,
  Reason,
  StepDock,
  showFirstProblem,
  stepPending,
  useDay,
} from "../flow-kit";

const email = z.email();

/** The work language as the file keeps it: two to forty characters, one line. */
const LANGUAGE = { min: 2, max: 40 } as const;
/** The emergency contact's name, as the file keeps it. */
const CONTACT_NAME = { min: 2, max: 60 } as const;

/**
 * Step 2, "כתובת ודרכי קשר", or "דרכי קשר" where the business doesn't ask
 * for the address (H5b): the town from Israel's list of settlements
 * (searched in either language, spelled either way), the street and house
 * number, or with "אין שם רחוב" a neighbourhood or place, or a P.O. box;
 * the apartment and the zip optional, and the email optional too. Where the
 * business asks, a language for work and safety instructions and someone
 * to call in an emergency, both optional: the contact both a name and a
 * mobile number, or neither, saved apart from the file. A part the file
 * holds but the business no longer asks stays here to change or empty, and
 * says so. What is typed goes as typed: the domain's schema tidies it, here
 * and on the server. Each of its refusals is said under its own field
 * (`addressProblems`): at once for what is too long, and for the zip once
 * it is left or full. With nothing missing the main action can always be
 * pressed, and a press that can't save says every problem and goes to the
 * first. A move with this year's 101 handed in makes an updated one due
 * within a week: said, and the step stays until the person goes on, by the
 * same press with nothing changed since (the save is in: the database
 * would find nothing to change).
 */
export function AddressStep({ kit, active }: { kit: Kit; active: boolean }) {
  const { t, data } = kit;
  const { parts } = data;
  const day = useDay();
  const formId = formIdOf("address");
  const noStreetId = useId();
  const contactId = useId();
  const stored = data.address;
  const [city, setCity] = useState<City | null>(data.city);
  const [noStreet, setNoStreet] = useState(
    stored !== null && stored.kind !== "street",
  );
  const [instead, setInstead] = useState<"area" | "poBox">(
    stored?.kind === "poBox" ? "poBox" : "area",
  );
  const [street, setStreet] = useState(
    stored?.kind === "street" ? stored.street : "",
  );
  const [area, setArea] = useState(stored?.kind === "area" ? stored.area : "");
  const [poBox, setPoBox] = useState(
    stored?.kind === "poBox" ? stored.poBox : "",
  );
  const [number, setNumber] = useState(
    stored && stored.kind !== "poBox" ? (stored.number ?? "") : "",
  );
  const [apartment, setApartment] = useState(
    stored && stored.kind !== "poBox" ? (stored.apartment ?? "") : "",
  );
  const [zip, setZip] = useState(stored?.zip ?? "");
  // The zip is judged once it is left (or full): an old five-digit one too.
  const [zipLeft, setZipLeft] = useState(false);
  const [mail, setMail] = useState(data.email ?? "");
  const [language, setLanguage] = useState(data.workLanguage ?? "");
  const [contactName, setContactName] = useState(data.emergency?.name ?? "");
  const [contactPhone, setContactPhone] = useState<PhoneValue>({
    display: formatIsraeliMobile(data.emergency?.phone ?? ""),
    e164: data.emergency?.phone ?? null,
  });
  // The contact's number is judged once it is left.
  const [phoneLeft, setPhoneLeft] = useState(false);
  const [tried, setTried] = useState(false);
  const [pending, setPending] = stepPending(kit, "address");
  const [failure, setFailure] = useState<FileActionFailure | null>(null);
  // A move that makes this year's 101 due again: said, and the step stays,
  // with what that save sent.
  const [changeDueBy, setChangeDueBy] = useState<string | null>(null);
  const [savedAs, setSavedAs] = useState<string | null>(null);

  const kind = noStreet ? instead : "street";
  const address = {
    kind,
    cityCode: city?.code,
    ...(kind === "street" ? { street, number } : {}),
    ...(kind === "area"
      ? { area, ...(tidyLine(number) ? { number } : {}) }
      : {}),
    ...(kind === "poBox" ? { poBox } : {}),
    ...(kind !== "poBox" && tidyLine(apartment) ? { apartment } : {}),
    ...(tidyLine(zip) ? { zip } : {}),
  };
  // The address no longer asked can be emptied: nothing in it at all goes
  // as none.
  const addressAsked = data.asks.address;
  const addressEmpty =
    city === null &&
    [street, area, poBox, number, apartment, zip].every(
      (part) => tidyLine(part) === "",
    );
  const addressCleared = parts.address && !addressAsked && addressEmpty;
  const addressShown = parts.address && !addressCleared;
  const checked = addressSchema.safeParse(address);
  // Every refusal of the schema, under the field it is about.
  const problems: ReturnType<typeof addressProblems> = addressShown
    ? addressProblems(address)
    : {};
  const lineError = (field: "street" | "area" | "apartment", max: number) =>
    problems[field] === "tooLong"
      ? t.rich("tooLong", { max, ltr })
      : problems[field] === "invalid"
        ? t("address.lineInvalid")
        : null;
  const streetError = lineError("street", ADDRESS_TEXT_MAX);
  const areaError = lineError("area", ADDRESS_TEXT_MAX);
  const apartmentError = lineError("apartment", APARTMENT_MAX);
  const numberError = problems.number
    ? t.rich("address.numberInvalid", { ltr })
    : null;
  const zipError =
    problems.zip && (tried || zipLeft || zip.length >= ZIP_DIGITS)
      ? t("address.zipInvalid")
      : null;
  const poBoxError = problems.poBox ? t("address.poBoxInvalid") : null;
  const mailTyped = mail.trim();
  const mailLong = mailTyped.length > FILE_TEXT_MAX.email;
  const mailOk =
    mailTyped === "" || (!mailLong && email.safeParse(mailTyped).success);
  const mailError = mailLong
    ? t.rich("tooLong", { max: FILE_TEXT_MAX.email, ltr })
    : !mailOk && (tried || mailTyped.includes("@"))
      ? t("address.emailInvalid")
      : null;

  // The work language: one line of two to forty, or nothing.
  const languageTyped = tidyLine(language);
  const languageLong = languageTyped.length > LANGUAGE.max;
  const languageShort =
    languageTyped !== "" && languageTyped.length < LANGUAGE.min;
  const languageOk =
    !parts.workLanguage ||
    languageTyped === "" ||
    (!languageLong && !languageShort && !CONTROL_OR_BREAK.test(languageTyped));
  const languageError = languageLong
    ? t.rich("tooLong", { max: LANGUAGE.max, ltr })
    : languageShort && tried
      ? t("address.workLanguageShort")
      : null;

  // The emergency contact: both a name and a mobile number, or neither.
  const nameTyped = tidyLine(contactName);
  const phoneTyped = contactPhone.display.replace(/\D/g, "") !== "";
  const contactBoth = nameTyped !== "" && phoneTyped;
  const contactNone = nameTyped === "" && !phoneTyped;
  const nameLong = nameTyped.length > CONTACT_NAME.max;
  const nameShort = nameTyped !== "" && nameTyped.length < CONTACT_NAME.min;
  const phoneBad = phoneTyped && contactPhone.e164 === null;
  const contactOk =
    !parts.emergency ||
    contactNone ||
    (contactBoth && !nameLong && !nameShort && !phoneBad);
  const nameError = !parts.emergency
    ? null
    : nameLong
      ? t.rich("tooLong", { max: CONTACT_NAME.max, ltr })
      : nameShort && tried
        ? t("address.emergencyNameShort")
        : tried && nameTyped === "" && phoneTyped
          ? t("address.emergencyBoth")
          : null;
  const phoneError = !parts.emergency
    ? null
    : phoneBad && (tried || phoneLeft)
      ? t("address.emergencyPhoneInvalid")
      : tried && !phoneTyped && nameTyped !== ""
        ? t("address.emergencyBoth")
        : null;

  const empty = addressShown
    ? [
        city === null,
        kind === "street" && tidyLine(street) === "",
        kind === "street" && tidyLine(number) === "",
        kind === "area" && tidyLine(area) === "",
        kind === "poBox" && tidyLine(poBox) === "",
      ].filter(Boolean).length
    : 0;
  const ready =
    empty === 0 &&
    (!addressShown || checked.success) &&
    mailOk &&
    languageOk &&
    contactOk;

  // What changed of the language and the contact: only that goes, so a
  // save that leaves them alone writes nothing of them.
  const languageNow = languageTyped === "" ? null : languageTyped;
  const languageChanged =
    parts.workLanguage && languageNow !== (data.workLanguage ?? null);
  const contactSent =
    contactBoth && contactPhone.e164
      ? { name: contactName, phone: contactPhone.e164 }
      : null;
  const contactChanged =
    parts.emergency &&
    JSON.stringify(contactSent ? [nameTyped, contactSent.phone] : null) !==
      JSON.stringify(
        data.emergency ? [data.emergency.name, data.emergency.phone] : null,
      );

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTried(true);
    if (pending) return;
    const form = event.currentTarget;
    if (!ready || firstProblem(form)) {
      showFirstProblem(form);
      return;
    }
    const sent = {
      ...(parts.address ? { address: addressCleared ? null : address } : {}),
      email: mailTyped || null,
      ...(languageChanged
        ? { workLanguage: languageNow === null ? null : language }
        : {}),
      ...(contactChanged ? { emergency: contactSent } : {}),
    };
    const sentAs = JSON.stringify(sent);
    // Pressed again after the save the step stayed for, nothing changed
    // since: it is in, and the person goes on, as a second save would.
    if (changeDueBy !== null && savedAs === sentAs) {
      setTried(false);
      setChangeDueBy(null);
      kit.say(t("saved"));
      if (active) kit.go(kit.next("address"));
      return;
    }
    setPending(true);
    setFailure(null);
    const result = await kit.actions
      .saveStep("address", sent)
      .catch(() => ({ ok: false, failure: "failed" }) as const);
    setPending(false);
    if (!result.ok) {
      setFailure(result.failure);
      return;
    }
    setTried(false);
    setChangeDueBy(result.changeDueBy);
    setSavedAs(sentAs);
    kit.say(t("saved"));
    if (active && !result.changeDueBy) {
      kit.go(kit.next("address"));
    }
  }

  const notAsked = (
    <p className="px-1 text-base text-ink-2">
      {t("address.notAsked", { business: data.businessName })}
    </p>
  );

  return (
    <FileSection step="address" active={active} kit={kit}>
      <form
        id={formId}
        onSubmit={save}
        noValidate
        className="flex flex-col gap-5"
      >
        {parts.address ? (
          <>
            {addressAsked ? null : notAsked}
            <Card padding="lg" className="flex flex-col gap-4">
              <CityField
                label={
                  addressAsked
                    ? t("address.city")
                    : t("optionalField", { field: t("address.city") })
                }
                locale={data.locale}
                value={city}
                onChange={setCity}
                emptyText={t("address.cityNone")}
                unpickedText={t("address.cityUnpicked")}
                placeholder={t("search.placeholder")}
              />
              <div className="flex min-h-11 items-center justify-between gap-3">
                <span id={noStreetId} className="font-medium text-base">
                  {t("address.noStreet")}
                </span>
                <Switch
                  aria-labelledby={noStreetId}
                  checked={noStreet}
                  onChange={setNoStreet}
                />
              </div>
              {noStreet ? (
                <Segmented
                  label={t("address.instead")}
                  value={instead}
                  onChange={setInstead}
                  options={[
                    { value: "area", label: t("address.area") },
                    { value: "poBox", label: t("address.poBox") },
                  ]}
                />
              ) : null}
              {kind === "street" ? (
                <TextField
                  label={t("address.street")}
                  value={street}
                  onChange={(event) => setStreet(event.target.value)}
                  error={streetError}
                  autoComplete="address-line1"
                />
              ) : kind === "area" ? (
                <TextField
                  label={t("address.area")}
                  value={area}
                  onChange={(event) => setArea(event.target.value)}
                  error={areaError}
                />
              ) : (
                <TextField
                  label={t("address.poBox")}
                  value={poBox}
                  onChange={(event) => setPoBox(event.target.value)}
                  error={poBoxError}
                  dir="ltr"
                  className={ltrInputClass}
                  inputMode="numeric"
                />
              )}
              {kind !== "poBox" ? (
                <div className="grid grid-cols-2 gap-3">
                  <TextField
                    label={
                      kind === "street"
                        ? t("address.number")
                        : t("optionalField", { field: t("address.number") })
                    }
                    value={number}
                    onChange={(event) => setNumber(event.target.value)}
                    error={numberError}
                    dir="ltr"
                    className={ltrInputClass}
                  />
                  <TextField
                    label={t("optionalField", {
                      field: t("address.apartment"),
                    })}
                    value={apartment}
                    onChange={(event) => setApartment(event.target.value)}
                    error={apartmentError}
                    dir="ltr"
                    className={ltrInputClass}
                  />
                </div>
              ) : null}
              <TextField
                label={t("optionalField", { field: t("address.zip") })}
                value={zip}
                onChange={(event) => setZip(event.target.value)}
                onBlur={() => setZipLeft(true)}
                error={zipError}
                dir="ltr"
                className={ltrInputClass}
                inputMode="numeric"
                autoComplete="postal-code"
              />
              <Reason>{t("address.reason")}</Reason>
            </Card>
          </>
        ) : null}

        <Card padding="lg" className="flex flex-col gap-4">
          <TextField
            label={t("optionalField", { field: t("address.email") })}
            type="email"
            value={mail}
            onChange={(event) => setMail(event.target.value)}
            error={mailError}
            hint={t("address.emailReason", { business: data.businessName })}
            dir="ltr"
            className={ltrInputClass}
            autoComplete="email"
            inputMode="email"
          />
        </Card>

        {parts.workLanguage ? (
          <>
            {data.asks.workLanguage ? null : notAsked}
            <Card padding="lg" className="flex flex-col gap-2">
              <TextField
                label={t("optionalField", {
                  field: t("address.workLanguage"),
                })}
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                error={languageError}
                hint={t("address.workLanguageHint")}
                autoComplete="off"
              />
              <Reason>{t("address.workLanguageReason")}</Reason>
            </Card>
          </>
        ) : null}

        {parts.emergency ? (
          <>
            {data.asks.emergencyContact ? null : notAsked}
            <Card padding="lg" className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <CardTitle id={contactId}>
                  {t("optionalField", { field: t("address.emergencyTitle") })}
                </CardTitle>
                <VisibilityNote>{t("address.emergencyReason")}</VisibilityNote>
              </div>
              <fieldset
                aria-labelledby={contactId}
                className="flex min-w-0 flex-col gap-4"
              >
                <TextField
                  label={t("address.emergencyName")}
                  value={contactName}
                  onChange={(event) => setContactName(event.target.value)}
                  error={nameError}
                  autoComplete="off"
                />
                <PhoneField
                  label={t("address.emergencyPhone")}
                  defaultValue={data.emergency?.phone ?? ""}
                  onPhoneChange={setContactPhone}
                  onBlur={() => setPhoneLeft(true)}
                  error={phoneError}
                  autoComplete="off"
                />
              </fieldset>
            </Card>
          </>
        ) : null}

        {changeDueBy ? (
          <p role="status" className="px-1 font-medium text-base">
            {t("changeDue", { date: day(changeDueBy) })}
          </p>
        ) : null}

        <Failure>
          {failure ? t(`failures.${failureKey(failure)}`) : null}
        </Failure>
        {tried && empty > 0 ? (
          <p role="status" className="hidden px-1 text-base xl:block">
            {t("missingRequired", { count: empty })}
          </p>
        ) : null}
        <div className="hidden xl:flex">
          <Button type="submit" variant="secondary" loading={pending}>
            {parts.address
              ? t("actions.saveAddress")
              : t("actions.saveContact")}
          </Button>
        </div>
      </form>
      <LaterLink kit={kit} />
      {active ? (
        <StepDock
          kit={kit}
          step="address"
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
