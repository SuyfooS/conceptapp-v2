"use client";

import {
  ADDRESS_TEXT_MAX,
  APARTMENT_MAX,
  addressProblems,
  addressSchema,
  ZIP_DIGITS,
} from "@domain/address";
import type { City } from "@domain/cities";
import { nextFileStep } from "@domain/employee-file-steps";
import { tidyLine } from "@domain/typed-text";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { CityField } from "@ui/city-field";
import { Segmented } from "@ui/segmented";
import { Switch } from "@ui/switch";
import { ltrInputClass, TextField } from "@ui/text-field";
import { type FormEvent, useId, useState } from "react";
import { z } from "zod";
import { failureKey } from "../failure-words";
import type { FileActionFailure } from "../file-types";
import {
  Failure,
  FileSection,
  firstProblem,
  type Kit,
  LaterLink,
  ltr,
  Reason,
  StepDock,
  showFirstProblem,
} from "../flow-kit";

const email = z.email();

/**
 * Step 2, "כתובת ודרכי קשר": the town from Israel's list of settlements
 * (searched in either language, spelled either way), the street and house
 * number, or with "אין שם רחוב" a neighbourhood or place, or a P.O. box;
 * the apartment and the zip optional, and the email optional too. What is
 * typed goes as typed: the domain's schema tidies it, here and on the
 * server. Each of its refusals is said under its own field (`addressProblems`):
 * at once for what is too long, and for the zip once it is left or full.
 * With nothing missing the main action can always be pressed, and a press
 * that can't save says every problem and goes to the first.
 */
export function AddressStep({ kit, active }: { kit: Kit; active: boolean }) {
  const { t, data } = kit;
  const formId = useId();
  const noStreetId = useId();
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
  const [tried, setTried] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<FileActionFailure | null>(null);

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
  const checked = addressSchema.safeParse(address);
  // Every refusal of the schema, under the field it is about.
  const problems = addressProblems(address);
  const lineError = (field: "street" | "area" | "apartment", max: number) =>
    problems[field] === "tooLong"
      ? t.rich("address.tooLong", { max, ltr })
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
  const mailOk = mailTyped === "" || email.safeParse(mailTyped).success;
  const mailError =
    !mailOk && (tried || mailTyped.includes("@"))
      ? t("address.emailInvalid")
      : null;

  const empty = [
    city === null,
    kind === "street" && tidyLine(street) === "",
    kind === "street" && tidyLine(number) === "",
    kind === "area" && tidyLine(area) === "",
    kind === "poBox" && tidyLine(poBox) === "",
  ].filter(Boolean).length;
  const ready = empty === 0 && checked.success && mailOk;

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
    const result = await kit.actions
      .saveStep("address", { address, email: mailTyped || null })
      .catch(() => ({ ok: false, failure: "failed" }) as const);
    setPending(false);
    if (!result.ok) {
      setFailure(result.failure);
      return;
    }
    kit.say(t("saved"));
    if (active) kit.go(nextFileStep("address") ?? "done");
  }

  return (
    <FileSection step="address" active={active} kit={kit}>
      <form
        id={formId}
        onSubmit={save}
        noValidate
        className="flex flex-col gap-5"
      >
        <Card padding="lg" className="flex flex-col gap-4">
          <CityField
            label={t("address.city")}
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
                label={t("optionalField", { field: t("address.apartment") })}
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
            {t("actions.saveAddress")}
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
