"use client";

import { nameError, tidyText } from "@domain/business";
import {
  BUSINESS_DETAIL_KEYS,
  type BusinessDetailKey,
  type BusinessDetails,
  businessDetailProblem,
} from "@domain/business-details";
import {
  DEFAULT_SHABBAT_CITY,
  SHABBAT_CITIES,
  type ShabbatCity,
} from "@domain/shabbat";
import { AccentPicker, AccentPreview } from "@ui/accent-picker";
import { Card } from "@ui/card";
import { ChoiceMenu } from "@ui/choice-menu";
import { FieldGroup, GroupedField } from "@ui/field-group";
import { FieldRow } from "@ui/field-row";
import { PageSection } from "@ui/page";
import { StatusToast } from "@ui/status-toast";
import { useTranslations } from "next-intl";
import { type KeyboardEvent, useRef, useState } from "react";
import type {
  SaveSettings,
  SettingsFailure,
  SettingsResult,
} from "./settings-types";
import type { CityShabbat } from "./shabbat-by-city";
import { TYPING_MS, useDraft } from "./use-draft";

/**
 * A business's own details: how it looks to its people (the name and the
 * colour, shown at once in a preview), its address, and the city its Shabbat
 * times follow. Each control saves itself. A tap that fails goes back to what's
 * stored; something typed that fails stays, to try again on leaving the field.
 */
export function BusinessDetailsForm({
  details,
  save,
  viewOnly,
  showCity,
  cities,
  nested = false,
}: {
  details: BusinessDetails;
  save: SaveSettings;
  viewOnly: boolean;
  /** Whether Shabbat times matter here: the business closes on Shabbat, or it's the console. */
  showCity: boolean;
  /** The coming Shabbat in each city. */
  cities: Record<ShabbatCity, CityShabbat>;
  /** Inside a section of its own, as in the console. */
  nested?: boolean;
}) {
  const t = useTranslations("app.manage.business");
  const tm = useTranslations("app.manage");
  const tc = useTranslations("cities");
  // What was changed on this screen; the rest is as the server read it.
  const [changed, setChanged] = useState<Partial<BusinessDetails>>({});
  // What didn't save, per detail. Something typed that failed stays on screen,
  // so its line stays until it saves. A pick went back to what's stored, so
  // its line goes with the next save of anything.
  const [failures, setFailures] = useState<
    Partial<Record<BusinessDetailKey, SettingsFailure>>
  >({});
  const clearFailure = (key: BusinessDetailKey) =>
    setFailures(({ [key]: _, ...rest }) => rest);
  const clearAfterSave = (key: BusinessDetailKey) =>
    setFailures(
      ({ [key]: _, accent: _accent, shabbatCity: _city, ...typed }) => typed,
    );
  const [saved, setSaved] = useState(0);
  const latest = useRef<Partial<Record<BusinessDetailKey, number>>>({});
  // What did save from this screen, for a pick that fails to go back to.
  const confirmed = useRef<Partial<BusinessDetails>>({});
  // The colour the screen opened with, offered back while it's open.
  const [opened] = useState(details.accent);
  const current: BusinessDetails = { ...details, ...changed };

  /**
   * A pick shows at once and goes back if it fails. What's typed shows once
   * it's saved, so a failure keeps it on screen.
   */
  async function change<Key extends BusinessDetailKey>(
    key: Key,
    value: BusinessDetails[Key],
    picked: boolean,
  ) {
    const mine = (latest.current[key] ?? 0) + 1;
    latest.current[key] = mine;
    if (picked) setChanged((before) => ({ ...before, [key]: value }));
    let result: SettingsResult;
    try {
      result = await save({ [key]: value });
    } catch {
      result = { ok: false, failure: "failed" };
    }
    if (result.ok) {
      confirmed.current = { ...confirmed.current, [key]: value };
      if (!picked) setChanged((before) => ({ ...before, [key]: value }));
      clearAfterSave(key);
      setSaved((count) => count + 1);
      return;
    }
    const reason = result.failure;
    setFailures((before) => ({ ...before, [key]: reason }));
    // Back to what last saved; a later change to the same detail has the last word.
    if (picked && latest.current[key] === mine) {
      setChanged(({ [key]: _, ...rest }) =>
        key in confirmed.current
          ? { ...rest, [key]: confirmed.current[key] }
          : rest,
      );
    }
  }

  const name = useDraft(
    current.name,
    (text) => !businessDetailProblem("name", text),
    (text) => void change("name", tidyText(text), false),
    null,
    tidyText,
  );
  const address = useDraft(
    current.address ?? "",
    (text) => !businessDetailProblem("address", text),
    (text) => void change("address", tidyText(text) || null, false),
    null,
    tidyText,
  );
  const accent = useDraft(
    current.accent,
    (hex) => !businessDetailProblem("accent", hex),
    (hex) => void change("accent", hex, true),
    TYPING_MS,
  );
  const nameProblem = nameError(tidyText(name.draft));

  const city = current.shabbatCity;
  const times = cities[city ?? DEFAULT_SHABBAT_CITY];
  const cityOptions = SHABBAT_CITIES.map((key) => ({ key, label: tc(key) }));
  const cityHint = (
    <>
      {t.rich(city ? "city.times" : "city.timesNone", {
        city: tc(city ?? DEFAULT_SHABBAT_CITY),
        candles: times.candleLighting,
        havdalah: times.havdalah,
        ltr: (chunks) => <span dir="ltr">{chunks}</span>,
      })}{" "}
      {t("city.nearest")}
    </>
  );

  const leaveOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") event.currentTarget.blur();
  };

  return (
    <>
      <StatusToast
        message={saved > 0 ? tm("saved") : null}
        stamp={String(saved)}
        duration={1800}
      />
      {Object.keys(failures).length > 0 ? (
        <Card
          tone="float"
          padding="md"
          role="alert"
          className="sticky top-[calc(env(safe-area-inset-top)+4rem)] z-10 flex flex-col gap-1 font-medium text-danger xl:top-4"
        >
          {BUSINESS_DETAIL_KEYS.map((key) => {
            const reason = failures[key];
            return reason ? (
              <p key={key}>
                {t(`${key}.label`)}: {tm(`failed.${reason}`)}
              </p>
            ) : null;
          })}
        </Card>
      ) : null}
      {viewOnly ? <p className="text-ink-2">{tm("viewOnly")}</p> : null}
      <div className="grid items-start gap-6 md:grid-cols-2 md:gap-8">
        <div className="md:col-start-1 md:row-start-1">
          <AccentPreview
            accent={accent.draft}
            caption={t("preview")}
            title={tidyText(name.draft) || current.name}
            button={t("previewButton")}
          />
        </div>
        <FieldGroup className="md:col-start-2 md:row-span-2 md:row-start-1">
          <GroupedField
            label={t("name.label")}
            hint={t("name.hint")}
            error={nameProblem ? t(`name.${nameProblem}`) : undefined}
            value={name.draft}
            maxLength={80}
            autoComplete="organization"
            enterKeyHint="done"
            disabled={viewOnly}
            onChange={(event) => name.edit(event.target.value)}
            onBlur={() => {
              if (tidyText(name.draft) === current.name) clearFailure("name");
              name.leave();
            }}
            onKeyDown={leaveOnEnter}
          />
          <GroupedField
            label={t("address.label")}
            hint={t("address.hint")}
            placeholder={t("address.placeholder")}
            value={address.draft}
            maxLength={200}
            autoComplete="street-address"
            enterKeyHint="done"
            disabled={viewOnly}
            onChange={(event) => address.edit(event.target.value)}
            onBlur={() => {
              if (tidyText(address.draft) === (current.address ?? "")) {
                clearFailure("address");
              }
              address.leave();
            }}
            onKeyDown={leaveOnEnter}
          />
          {showCity ? (
            <FieldRow label={t("shabbatCity.label")} hint={cityHint}>
              {viewOnly ? (
                <span className="font-medium text-ink-2">
                  {city ? tc(city) : t("city.none")}
                </span>
              ) : (
                <ChoiceMenu
                  label={`${t("shabbatCity.label")}: ${city ? tc(city) : t("city.none")}`}
                  value={city ?? ""}
                  options={cityOptions}
                  placeholder={t("city.none")}
                  onChange={(key) =>
                    void change(
                      "shabbatCity",
                      SHABBAT_CITIES.find((option) => option === key) ?? null,
                      true,
                    )
                  }
                />
              )}
            </FieldRow>
          ) : null}
        </FieldGroup>
        <PageSection
          title={t("accent.label")}
          level={nested ? 3 : 2}
          className="md:col-start-1 md:row-start-2"
        >
          <AccentPicker
            value={accent.draft}
            kept={opened}
            label={t("accent.label")}
            disabled={viewOnly}
            onPick={(hex, from) =>
              from === "preset" ? accent.commit(hex) : accent.edit(hex)
            }
            onCustomDone={accent.leave}
          />
        </PageSection>
      </div>
    </>
  );
}
