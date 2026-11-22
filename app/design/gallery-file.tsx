"use client";

import { checkBankAccount } from "@domain/bank-account";
import { banksOn } from "@domain/banks";
import type { City } from "@domain/cities";
import type { Country } from "@domain/identity-documents";
import { isIsraeliId } from "@domain/israeli-id";
import { BankField, type BankFieldValue } from "@ui/bank-field";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { CityField } from "@ui/city-field";
import { CountryField } from "@ui/country-field";
import { IdField } from "@ui/id-field";
import { MaskedValue } from "@ui/masked-value";
import { StepList, StepRow } from "@ui/step-list";
import { Steps } from "@ui/steps";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { business } from "./shell/data";

const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;
const TODAY = "2026-11-24";

/**
 * The hiring file's parts (profile H5a): the steps bar and the list with
 * its current step, an ID number checked as it is typed, a bank account
 * with its check in words, a town and a country found by typing, and a
 * number shown for a minute. Nothing typed here goes anywhere.
 */
export function GalleryFile() {
  const t = useTranslations("design");
  const tf = useTranslations("app.file");
  const tb = useTranslations("banks");
  const locale = useLocale() === "en" ? "en" : "he";
  const [id, setId] = useState("");
  const [bank, setBank] = useState<BankFieldValue>({
    bank: 12,
    branch: "600",
    account: "100002",
    kept: false,
  });
  const [city, setCity] = useState<City | null>(null);
  const [country, setCountry] = useState<Country | null>(null);

  const check =
    bank.bank !== null && bank.branch !== "" && bank.account !== ""
      ? checkBankAccount(
          {
            bank: bank.bank,
            branch: Number(bank.branch),
            account: bank.account,
          },
          TODAY,
        )
      : null;
  const banks = banksOn(TODAY).map((one) => ({
    code: one.code,
    name: tb(String(one.code) as Parameters<typeof tb>[0]),
  }));

  return (
    <div className="flex flex-col gap-6">
      <p className="text-ink-2 text-sm">{t("fileText")}</p>
      <Card padding="lg" className="flex flex-col gap-4">
        <Steps
          count={6}
          current={4}
          label={tf("steps.count", { current: 4, count: 6 })}
        />
      </Card>
      <StepList aria-label={t("fileStepsCurrent")}>
        <StepRow
          mark="done"
          title={tf("steps.name.identity")}
          state={tf("steps.state.done")}
          href="/design/shell/me/file?step=identity"
        />
        <StepRow
          mark="open"
          title={tf("steps.name.bank")}
          state={tf("steps.state.open")}
          href="/design/shell/me/file?step=bank"
          current
        />
        <StepRow
          mark="done"
          title={tf("steps.name.pension")}
          detail={tf("steps.state.direct")}
          state={tf("steps.state.done")}
        />
      </StepList>
      <Card padding="lg" className="flex flex-col gap-4">
        <IdField
          label={t("fileId")}
          kind="il"
          value={id}
          onChange={setId}
          hint={t("fileIdHint")}
          error={
            id.length === 9 && !isIsraeliId(id)
              ? tf("identity.idInvalid")
              : undefined
          }
        />
        <MaskedValue
          label={tf("identity.idNumber")}
          masked="•••0018"
          onReveal={async () => "000000018"}
          showLabel={tf("masked.show")}
          hideLabel={tf("masked.hide")}
          hiddenLabel={tf("masked.hidden", { what: tf("identity.idNumber") })}
          failedLabel={tf("masked.failed")}
        />
      </Card>
      <Card padding="lg">
        <BankField
          labels={{
            paste: tf("bank.paste"),
            pasteHint: tf.rich("bank.pasteHint", { ltr }),
            pasteNone: tf("bank.pasteNone"),
            bank: tf("bank.bank"),
            choose: tf("bank.choose"),
            branch: tf("bank.branch"),
            account: tf("bank.account"),
            where: tf("bank.where"),
            keep: tf("bank.keep"),
            kept: tf("bank.kept", { business: business.name }),
          }}
          banks={banks}
          value={bank}
          onChange={setBank}
          warning={
            check?.status === "warning"
              ? tf(`bank.warning.${check.warning}`)
              : null
          }
          error={
            check?.status === "unusable" ? tf("bank.accountInvalid") : null
          }
        />
      </Card>
      <Card padding="lg" className="flex flex-col gap-4">
        <CityField
          label={t("fileCity")}
          locale={locale}
          value={city}
          onChange={setCity}
          emptyText={tf("address.cityNone")}
          unpickedText={tf("address.cityUnpicked")}
          placeholder={tf("search.placeholder")}
        />
        <CountryField
          label={t("fileCountry")}
          locale={locale}
          value={country}
          onChange={setCountry}
          emptyText={tf("identity.countryNone")}
          unpickedText={tf("identity.countryUnpicked")}
          placeholder={tf("search.placeholder")}
        />
      </Card>
      <Button asChild variant="secondary" className="w-full">
        <Link href="/design/shell/me/file">{t("fileDemo")}</Link>
      </Button>
      {/* A former worker's old file, read-only (H5c). */}
      <Button asChild variant="secondary" className="w-full">
        <Link href="/design/screens/past-file">{t("filePastDemo")}</Link>
      </Button>
    </div>
  );
}
