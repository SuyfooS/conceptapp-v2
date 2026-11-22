import { formatBankCode } from "@domain/banks";
import type { FileGroup } from "@domain/employee-file";
import { fileStepStates, pensionDue } from "@domain/employee-file-steps";
import { isPensionFund } from "@domain/pension-funds";
import { Button } from "@ui/button";
import { Card, CardText } from "@ui/card";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageSection } from "@ui/page";
import { ProgressRing } from "@ui/progress-ring";
import { VisibilityNote } from "@ui/visibility-note";
import {
  FileText,
  IdCard,
  Landmark,
  MapPin,
  PiggyBank,
  Siren,
} from "lucide-react";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { getFormatter } from "next-intl/server";
import type { ReactNode } from "react";
import { type AppWording, translator } from "../wording";
import { currentFileScreen } from "./file/file";
import { fileStepInputOf } from "./file/file-parts";
import type { FileScreenData } from "./file/file-types";

/**
 * The person's own file as /me shows it (profile H5a), or null where there
 * is none to show: the module off, off the staff, viewing as a role, or
 * anything that went wrong, which never takes the profile down with it.
 */
export async function currentFileSummary(): Promise<FileScreenData | null> {
  try {
    const screen = await currentFileScreen();
    return screen.kind === "file" ? screen.data : null;
  } catch (error) {
    // Next's own throws (a prefetch's render stopping at a request-time
    // read, a redirect) go on to Next: they are no failure of the file.
    unstable_rethrow(error);
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code: unknown }).code)
        : "without a code";
    // The error's kind, never its message: a message could carry a value.
    const kind = error instanceof Error ? error.name : typeof error;
    console.error("reading the file for the profile failed", code, kind);
    return null;
  }
}

const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

/**
 * The way into the file from the profile: while something is missing, the
 * screen's one accent card says how much, with "השלמת הפרטים" (not for an
 * owner, who isn't counted, and may still fill a file for themselves); then
 * "התיק שלי ב{business}", who sees it, and a row for each part the business
 * asks or the file holds (H5b): the identity and the pension always, the
 * address, the account and the emergency contact where they show, and Form
 * 101 unless it is taken outside the app; each to its step. Hebrew, as the
 * profile is. Also drawn with mock data on the twin.
 */
export async function FileSummary({
  data,
  wording,
  base = "",
}: {
  data: FileScreenData;
  wording: AppWording;
  /** "" in the app, "/design/shell" on the twin. */
  base?: string;
}) {
  const t = translator(wording, "app.me.file");
  const tf = translator(wording, "app.file");
  const tb = translator(wording, "banks");
  const tp = translator(wording, "pensionFunds");
  const format = await getFormatter();
  const day = (date: string) =>
    format.dateTime(new Date(`${date}T12:00:00Z`), {
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    });
  const business = data.businessName;
  const file = data.file;
  const direct = (group: FileGroup) =>
    file?.direct_groups.includes(group) ?? false;
  const states = fileStepStates(fileStepInputOf(data));
  const { parts } = data;
  const plain = (group: FileGroup) =>
    direct(group)
      ? t("values.direct")
      : data.missing.includes(group)
        ? t("values.missing")
        : t("values.done");

  const bankKey = file?.bank_code == null ? null : String(file.bank_code);
  const bank =
    direct("bank") || !file?.has.bank_account || bankKey === null
      ? plain("bank")
      : t.rich("values.bank", {
          bank: tb.has(bankKey as never)
            ? tb(bankKey as never)
            : formatBankCode(Number(bankKey)),
          masked: data.masked.bankAccount ?? "",
          ltr,
        });

  const due = pensionDue(data.pensionDueOn, data.today);
  const answer = file?.pension_answer ?? null;
  const fund = file?.pension_fund ?? null;
  const pension = direct("pension")
    ? t("values.direct")
    : answer === "employer"
      ? t("values.employer", { business })
      : (answer === "existing" || answer === "new") && isPensionFund(fund)
        ? tp(fund)
        : answer === "existing" || answer === "new"
          ? t("values.done")
          : due.kind === "open"
            ? t("values.dueOn", { date: day(due.dueOn) })
            : due.kind === "passed"
              ? t("values.duePassed")
              : t("values.missing");

  const href = (step: string) => `${base}/me/file?step=${step}`;
  const asked = data.asked.length;
  const missing = data.missing.length;

  return (
    <>
      {data.role !== "owner" && missing > 0 ? (
        <Card tone="accent" padding="lg" className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <ProgressRing value={asked - missing} max={asked} />
            <CardText className="text-pretty font-medium text-ink">
              {t("missing", { count: missing })}
            </CardText>
          </div>
          <Button asChild size="lg" className="w-full md:w-auto md:self-start">
            <Link href={`${base}/me/file`}>{t("complete")}</Link>
          </Button>
        </Card>
      ) : null}
      <PageSection title={t("title", { business })}>
        <div className="-mt-1 px-1">
          <VisibilityNote icon="lock">{t("visible")}</VisibilityNote>
        </div>
        <ListGroup>
          <ListRow
            href={href("identity")}
            leading={<IdCard />}
            title={t("rows.identity")}
            subtitle={plain("identity")}
          />
          {parts.address ? (
            <ListRow
              href={href("address")}
              leading={<MapPin />}
              title={t("rows.address")}
              subtitle={plain("address")}
            />
          ) : null}
          {parts.emergency ? (
            <ListRow
              href={href("address")}
              leading={<Siren />}
              title={t("rows.emergency")}
              subtitle={data.emergency?.name ?? t("values.none")}
            />
          ) : null}
          {parts.bank ? (
            <ListRow
              href={href("bank")}
              leading={<Landmark />}
              title={t("rows.bank")}
              subtitle={bank}
            />
          ) : null}
          <ListRow
            href={href("pension")}
            leading={<PiggyBank />}
            title={t("rows.pension")}
            subtitle={pension}
          />
          {parts.form101 ? (
            <ListRow
              href={href("form101")}
              leading={<FileText />}
              title={t.rich("rows.form101", { year: data.year, ltr })}
              subtitle={
                states.form101 === "direct"
                  ? t("values.direct")
                  : tf("form101.status", {
                      status: data.taxYear?.status ?? "none",
                    })
              }
            />
          ) : null}
        </ListGroup>
      </PageSection>
    </>
  );
}
