import { formatBankCode } from "@domain/banks";
import { cityName } from "@domain/cities";
import { accentTokens } from "@domain/color";
import type { FileGroup, RevealField } from "@domain/employee-file";
import { isPensionFund, UNKNOWN_FUND } from "@domain/pension-funds";
import { displayIsraeliMobile } from "@domain/phone";
import { ISRAEL_TIME_ZONE } from "@domain/shabbat";
import { accentProps } from "@ui/accent";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { cn } from "@ui/cn";
import { EmptyState } from "@ui/empty-state";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { glowClass } from "@ui/page-glow";
import { VisibilityNote } from "@ui/visibility-note";
import { FolderClock } from "lucide-react";
import Link from "next/link";
import { createFormatter } from "next-intl";
import type { ReactNode } from "react";
import type { RevealAnswer } from "../../../(app)/me/file/file-types";
import {
  baseWording,
  englishWording,
  translator,
} from "../../../(app)/wording";
import { contactTitleKey, pastBackHref, pastPartsOf } from "./past-file-parts";
import type {
  PastFileData,
  PastFileScreen,
  PastFrame,
} from "./past-file-types";
import { PastNumber } from "./past-number";

/*
 * A former worker's own file in a business they left (profile H5c), drawn
 * by /me/past/<business> and by its twin: read-only, outside the app's
 * frame, in the business's colour and in the person's own language (Hebrew,
 * or English if they chose it for the file), with no main action and no
 * write. The ID and the account show their last digits, and "הצגה" asks
 * the server for each. A business's own sentences don't apply here: they
 * are Hebrew, and nothing of the business is theirs to read now.
 */

/** A screen's state that has no file to draw, with its frame. */
export type PastStateScreen = Extract<PastFileScreen, PastFrame>;

const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

/** The words a state is drawn in: the person's language. */
function wordsOf(frame: PastFrame) {
  const english = frame.locale === "en";
  const wording = english ? englishWording : baseWording;
  return {
    english,
    locale: english ? ("en" as const) : ("he" as const),
    t: translator(wording, "app.past"),
    tf: translator(wording, "app.file"),
    tm: translator(wording, "app.me.file"),
    tb: translator(wording, "banks"),
    tp: translator(wording, "pensionFunds"),
  };
}

/** "הפרופיל" back to /me, or "עבודות קודמות" back to the screen of someone with no business. */
function backOf(frame: PastFrame, backHref: string | undefined) {
  const { t, tf } = wordsOf(frame);
  return {
    href: backHref ?? pastBackHref(frame.back),
    label: frame.back === "profile" ? tf("back") : t("section"),
  };
}

/**
 * The frame every state is drawn in: the business's colour, the person's
 * language. Outside the app's frame, so the wash is the whole window's at
 * every width, as on the other screens outside it, and only the page is
 * narrowed: on the page, a wash would stop in a hard line at its edge.
 */
function Frame({ frame, children }: { frame: PastFrame; children: ReactNode }) {
  const english = frame.locale === "en";
  return (
    <div
      {...accentProps(accentTokens(frame.job.accent))}
      dir={english ? "ltr" : undefined}
      lang={english ? "en" : undefined}
      className={cn("min-h-dvh", glowClass)}
    >
      <PageBody className="max-w-5xl">{children}</PageBody>
    </div>
  );
}

type Line = { key: string; label: ReactNode; value: ReactNode };

/**
 * A part's plain rows: each a label over its value, hairlines between. A
 * value with nowhere to break, such as a long email, wraps inside its card.
 */
function Lines({
  lines,
  className,
}: {
  lines: (Line | null)[];
  className?: string;
}) {
  const shown = lines.filter((line): line is Line => line !== null);
  if (shown.length === 0) return null;
  return (
    <dl className={cn("flex flex-col divide-y divide-line", className)}>
      {shown.map((line) => (
        <div
          key={line.key}
          className="flex flex-col gap-0.5 py-3 first:pt-0 last:pb-0"
        >
          <dt className="text-ink-2 text-sm">{line.label}</dt>
          <dd className="text-pretty font-medium text-md wrap-anywhere">
            {line.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * One part of the file, in a card of its own: its number first or last
 * (never inside the rows, since it has its own label), its rows, and what
 * it says when a holder marked it handed on directly or nothing was given.
 */
function Part({
  title,
  number,
  numberLast = false,
  lines,
  direct,
  none,
}: {
  title: string;
  number?: ReactNode;
  numberLast?: boolean;
  lines: (Line | null)[];
  /** "נמסר ישירות לשכר", when a holder marked it so. */
  direct: string | null;
  /** "לא נמסר", said when there is nothing else. */
  none: string;
}) {
  const rows = lines.some((line) => line !== null);
  const empty = !number && !rows && !direct;
  return (
    <PageSection title={title}>
      <Card padding="lg" className="flex flex-col gap-3">
        {direct ? <p className="text-md">{direct}</p> : null}
        {number && !numberLast ? number : null}
        <Lines
          lines={lines}
          className={number && !numberLast ? "border-line border-t pt-3" : ""}
        />
        {number && numberLast ? (
          <div className={rows ? "border-line border-t pt-3" : ""}>
            {number}
          </div>
        ) : null}
        {empty ? <p className="text-ink-2 text-md">{none}</p> : null}
      </Card>
    </PageSection>
  );
}

/**
 * The old file, every part it holds. Phone: one column, the parts in their
 * order. Tablet: two columns, who they are and how to reach them, then the
 * account, the pension, Form 101 and what the business keeps. Desktop: the
 * same two, the first wider, every part in view at once. One DOM, the same
 * words on each.
 */
export function PastFileView({
  data,
  reveal,
  backHref,
}: {
  data: PastFileData;
  reveal: (field: RevealField) => Promise<RevealAnswer>;
  /** The twin's own; the app's follows `data.back`. */
  backHref?: string;
}) {
  const { locale, t, tf, tm, tb, tp } = wordsOf(data);
  const business = data.job.name;
  const file = data.file;
  const parts = pastPartsOf(data);
  const direct = (group: FileGroup) =>
    file?.direct_groups.includes(group) ? tm("values.direct") : null;
  const none = tm("values.none");

  const days = createFormatter({ locale, timeZone: "UTC" });
  const day = (date: string) =>
    days.dateTime(new Date(`${date}T12:00:00Z`), {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  // The business's zone can't be read after leaving: Israel's.
  const left = createFormatter({ locale, timeZone: ISRAEL_TIME_ZONE }).dateTime(
    new Date(data.job.leftAt),
    { month: "long", year: "numeric", timeZone: ISRAEL_TIME_ZONE },
  );
  const country = (code: string) =>
    new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code;
  const masked = (label: string) => ({
    show: tf("masked.show"),
    hide: tf("masked.hide"),
    hidden: tf("masked.hidden", { what: label }),
    failed: tf("masked.failed"),
  });

  // Who they are.
  const kind = file?.id_kind ?? null;
  const numberLabel =
    kind === "passport"
      ? tf("identity.passportNumber")
      : kind === "other"
        ? tf("identity.otherNumber")
        : tf("identity.idNumber");
  const idNumber = data.masked.id ? (
    <PastNumber
      field="id"
      label={numberLabel}
      masked={data.masked.id}
      words={masked(numberLabel)}
      reveal={reveal}
    />
  ) : null;
  const identity: (Line | null)[] = [
    kind === "other" && data.documentName
      ? {
          key: "document",
          label: tf("identity.otherName"),
          value: data.documentName,
        }
      : null,
    kind !== "il" && file?.id_country
      ? {
          key: "country",
          label: tf("identity.country"),
          value: country(file.id_country),
        }
      : null,
    file?.id_expires_on
      ? {
          key: "expires",
          label: tf("identity.expires"),
          value: day(file.id_expires_on),
        }
      : null,
    file?.legal_first_name
      ? {
          key: "first",
          label: tf("identity.firstName"),
          value: file.legal_first_name,
        }
      : null,
    file?.legal_last_name
      ? {
          key: "last",
          label: tf("identity.lastName"),
          value: file.legal_last_name,
        }
      : null,
    file?.birth_date
      ? {
          key: "birth",
          label: tf("identity.birthDate"),
          value: day(file.birth_date),
        }
      : null,
  ];

  // How to reach them.
  const address = data.address;
  const contact: (Line | null)[] = [
    address && data.city
      ? {
          key: "city",
          label: tf("address.city"),
          value: cityName(data.city, locale),
        }
      : null,
    address?.kind === "street"
      ? {
          key: "street",
          label: tf("address.street"),
          value: `${address.street} ${address.number}`,
        }
      : address?.kind === "area"
        ? {
            key: "area",
            label: tf("address.area"),
            value: address.number
              ? `${address.area} ${address.number}`
              : address.area,
          }
        : address?.kind === "poBox"
          ? {
              key: "poBox",
              label: tf("address.poBox"),
              value: <span dir="ltr">{address.poBox}</span>,
            }
          : null,
    address && address.kind !== "poBox" && address.apartment
      ? {
          key: "apartment",
          label: tf("address.apartment"),
          value: address.apartment,
        }
      : null,
    address?.zip
      ? {
          key: "zip",
          label: tf("address.zip"),
          value: <span dir="ltr">{address.zip}</span>,
        }
      : null,
    data.email
      ? {
          key: "email",
          label: tf("address.email"),
          value: <span dir="ltr">{data.email}</span>,
        }
      : null,
    data.workLanguage
      ? {
          key: "language",
          label: tf("address.workLanguage"),
          value: data.workLanguage,
        }
      : null,
    data.emergency
      ? {
          key: "emergency",
          label: tf("address.emergencyTitle"),
          value: (
            <>
              <span className="block">{data.emergency.name}</span>
              <span className="block font-normal text-base text-ink-2">
                <span dir="ltr">
                  {displayIsraeliMobile(data.emergency.phone)}
                </span>
              </span>
            </>
          ),
        }
      : null,
  ];

  // Where the wages went.
  const bankName =
    file?.bank_code == null
      ? null
      : tb.has(String(file.bank_code) as never)
        ? tb(String(file.bank_code) as never)
        : formatBankCode(file.bank_code);
  const bank: (Line | null)[] =
    file && bankName !== null && file.bank_branch !== null
      ? [
          {
            key: "bank",
            label: tf("bank.bank"),
            value: tf.rich("bank.currentLine", {
              bank: bankName,
              branch: String(file.bank_branch).padStart(3, "0"),
              ltr,
            }),
          },
          {
            key: "holder",
            label: tf("bank.holder"),
            value:
              file.bank_holder_kind === "family"
                ? data.holderName
                  ? tf("bank.holderLine", { name: data.holderName })
                  : tf("bank.family")
                : tf("bank.self"),
          },
        ]
      : [];
  const account = data.masked.bankAccount ? (
    <PastNumber
      field="bank_account"
      label={tf("bank.account")}
      masked={data.masked.bankAccount}
      words={masked(tf("bank.account"))}
      reveal={reveal}
    />
  ) : null;

  // The pension, as they answered it (its day to choose was the job's).
  const answer = file?.pension_answer ?? null;
  const fund = file?.pension_fund ?? null;
  const withFund = answer === "existing" || answer === "new";
  const fundName =
    fund === UNKNOWN_FUND
      ? t("values.fundUnknown")
      : isPensionFund(fund)
        ? tp(fund)
        : null;
  const pension: (Line | null)[] = [
    withFund || answer === "employer"
      ? {
          key: "answer",
          label: tf("pension.question"),
          value:
            answer === "existing"
              ? tf("pension.yes")
              : answer === "new"
                ? tf("pension.choose")
                : tf("pension.employer", { business }),
        }
      : null,
    withFund && fundName
      ? { key: "fund", label: tf("pension.which"), value: fundName }
      : null,
  ];

  // Each year's Form 101, the latest first.
  const form101: Line[] = [...data.taxYears]
    .sort((a, b) => b.year - a.year)
    .map((row) => ({
      key: String(row.year),
      label: tm.rich("rows.form101", { year: row.year, ltr }),
      value:
        row.route === "direct"
          ? tm("values.direct")
          : row.status === "returned"
            ? t("form101.returned", { reason: row.returnedReason ?? "other" })
            : tf("form101.status", { status: row.status }),
    }));

  const back = backOf(data, backHref);

  return (
    <Frame frame={data}>
      <PageHeader
        title={tf("title", { business })}
        subtitle={t("subtitle", { business, date: left })}
        back={back}
      />
      <VisibilityNote icon="lock" className="-mt-2 px-1 md:-mt-4">
        {tm("visible")}
      </VisibilityNote>
      <div className="flex flex-col gap-6 md:grid md:grid-cols-2 md:items-start xl:grid-cols-[3fr_2fr] xl:gap-8">
        <div className="flex min-w-0 flex-col gap-6">
          <Part
            title={tm("rows.identity")}
            number={idNumber}
            lines={identity}
            direct={direct("identity")}
            none={none}
          />
          {parts.contact ? (
            <Part
              title={tf(contactTitleKey(data))}
              lines={contact}
              direct={direct("address")}
              none={none}
            />
          ) : null}
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          {parts.bank ? (
            <Part
              title={tm("rows.bank")}
              number={account}
              numberLast
              lines={bank}
              direct={direct("bank")}
              none={none}
            />
          ) : null}
          <Part
            title={tm("rows.pension")}
            lines={pension}
            direct={direct("pension")}
            none={none}
          />
          {parts.form101 ? (
            <Part
              title={tf("steps.name.form101")}
              lines={form101}
              direct={null}
              none={none}
            />
          ) : null}
          <PageSection title={t("kept.title", { business })}>
            <Card
              padding="lg"
              className="flex flex-col gap-3 text-pretty text-base"
            >
              <p>{t("kept.body", { business })}</p>
              <p>{t("kept.here", { business })}</p>
              {/* Kept with the file, though managers read it no more. */}
              {data.emergency ? <p>{t("kept.emergency")}</p> : null}
              <p>{t("kept.fix", { business })}</p>
            </Card>
          </PageSection>
        </div>
      </div>
    </Frame>
  );
}

/**
 * No file to draw, in the same frame and words: the module off there now
 * (ask the business), nothing of theirs in it, the ConceptApp team viewing
 * as a role (no file is read), or no keys on this deployment. One way back.
 */
export function PastUnavailable({
  screen,
  backHref,
}: {
  screen: PastStateScreen;
  backHref?: string;
}) {
  const { t, tf } = wordsOf(screen);
  const business = screen.job.name;
  const back = backOf(screen, backHref);
  const body =
    screen.kind === "off"
      ? t("off", { business })
      : screen.kind === "empty"
        ? t("empty", { business })
        : screen.kind === "viewing"
          ? tf("viewing")
          : tf("failures.keys");
  return (
    <Frame frame={screen}>
      <PageHeader title={tf("title", { business })} back={back} />
      <EmptyState icon={<FolderClock />} headingLevel="h2" body={body}>
        <Button asChild variant="secondary">
          <Link href={back.href}>{back.label}</Link>
        </Button>
      </EmptyState>
    </Frame>
  );
}
