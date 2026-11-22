import type { Address } from "@domain/address";
import { formatBankCode } from "@domain/banks";
import { cityName, cityOf } from "@domain/cities";
import type { FileGroup } from "@domain/employee-file";
import { firstNameOf } from "@domain/people";
import { displayIsraeliMobile } from "@domain/phone";
import { formArg } from "@domain/profile";
import { Card } from "@ui/card";
import { EmptyState } from "@ui/empty-state";
import { PageBody, PageHeader } from "@ui/page";
import { VisibilityNote } from "@ui/visibility-note";
import { FileLock } from "lucide-react";
import { createFormatter } from "next-intl";
import type { ReactNode } from "react";
import { type AppWording, type Translator, translator } from "../../../wording";
import { roleLabel } from "../../role-label";
import { FileGate } from "./file-gate";
import { FileOpenWatch, LockFileButton } from "./file-open-watch";
import type {
  HolderFileActions,
  HolderFileData,
  HolderFileHead,
  HolderFileScreen,
} from "./holder-file-types";
import { HolderReveal } from "./holder-reveal";

const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

type T = Translator<"app">;
type Format = ReturnType<typeof createFormatter>;

/** Where the screen's links lead: the app's, or the twin's. */
export type HolderFilePaths = {
  /** The person's profile, for a reader who sees the team. */
  profile: string;
  /** The team screen, for a files-only reader. */
  team: string;
  /** The twin's states for what the app does by drawing itself again. */
  twin?: { opened: string; locked: string };
};

/**
 * Someone's hiring file as a holder reads it, `/team/[person]/file` (profile
 * H6a): "התיק של נועה" under her name and role, a line that every view is
 * recorded, and then one state at a time, each with at most one main
 * action: the duties screen with "אישור ושליחת קוד"; the locked file with
 * "שליחת קוד"; the code's boxes; or the file itself, with no main action,
 * in sections only of what the business asks or the file holds, the two
 * numbers as their last digits with "הצגה" for a minute, each missing part
 * said, and "נעילת התיק" at its foot. The ConceptApp team viewing as a role
 * and a deployment that can't open files get words only. Phone: one column;
 * tablet: the sections in two, the gate's card in the middle; desktop:
 * three. Also drawn with mock data on /design/shell/team/[person]/file.
 */
export function HolderFileView({
  screen,
  paths,
  actions,
  wording,
  code,
}: {
  screen: Exclude<HolderFileScreen, { kind: "closed" }>;
  paths: HolderFilePaths;
  actions: HolderFileActions;
  wording: AppWording;
  /** The twin's code step, open on the boxes. */
  code?: { tail: string };
}) {
  const t = translator(wording, "app");
  const { head } = screen;
  const format = createFormatter({
    locale: wording.locale ?? "he",
    timeZone: head.timeZone,
  });
  const name = head.name ?? t("team.noName");
  const first = head.name ? firstNameOf(head.name) : name;
  const back = head.seesTeam
    ? { href: paths.profile, label: first }
    : { href: paths.team, label: t("team.file.page.backTeam") };

  return (
    <PageBody className="max-w-6xl">
      <PageHeader
        title={t("team.file.page.title", { name })}
        subtitle={t("me.since", {
          role: roleLabel(t, head.role, head.namedRole),
          date: format.dateTime(new Date(head.since), {
            month: "long",
            year: "numeric",
          }),
        })}
        back={back}
      />
      <VisibilityNote icon="lock" className="-mt-2 md:max-w-2xl">
        {t("team.file.page.visible")}
      </VisibilityNote>
      {screen.kind === "viewing" || screen.kind === "unavailable" ? (
        <EmptyState
          icon={<FileLock />}
          headingLevel="h2"
          body={
            screen.kind === "viewing"
              ? t("team.file.viewing")
              : t("team.file.unavailable")
          }
        />
      ) : screen.kind === "duties" || screen.kind === "locked" ? (
        <div
          data-file-gate={screen.kind}
          className="flex w-full flex-col md:mx-auto md:max-w-xl"
        >
          <FileGate
            kind={screen.kind}
            actions={actions}
            code={code}
            openedHref={paths.twin?.opened}
          >
            {screen.kind === "duties" ? (
              <Duties t={t} business={head.businessName} />
            ) : null}
          </FileGate>
        </div>
      ) : (
        <FileOpenWatch actions={actions} lockedHref={paths.twin?.locked}>
          <OpenFile
            t={t}
            wording={wording}
            format={format}
            head={head}
            data={screen.data}
            actions={actions}
            paths={paths}
            first={first}
          />
        </FileOpenWatch>
      )}
    </PageBody>
  );
}

/** The seven lines a holder confirms before any file opens (version 2026-11-v1). */
const DUTIES = [
  "purpose",
  "copies",
  "others",
  "reveal",
  "lock",
  "leak",
  "ends",
] as const;

function Duties({ t, business }: { t: T; business: string }) {
  return (
    <>
      <p className="text-ink-2">{t("team.file.duties.intro", { business })}</p>
      <ul className="flex list-disc flex-col gap-2 ps-5">
        {DUTIES.map((line) => (
          <li key={line} className="text-pretty">
            {t(`team.file.duties.${line}`)}
          </li>
        ))}
      </ul>
    </>
  );
}

/** A day (`YYYY-MM-DD`) as the screens write it. */
const dayOf = (format: Format, day: string) =>
  format.dateTime(new Date(`${day}T12:00:00Z`), {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

/** A moment, by its day in the business's zone. */
const momentOf = (format: Format, at: string) =>
  format.dateTime(new Date(at), {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  });

/** One part of the file: what it is, over what it says. */
function Field({
  label,
  children,
  hint,
}: {
  label: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3 not-first:border-line not-first:border-t">
      <dt className="text-ink-2 text-sm">{label}</dt>
      <dd className="text-pretty font-medium text-md">{children}</dd>
      {hint ? <dd className="text-ink-2 text-sm">{hint}</dd> : null}
    </div>
  );
}

/** A number behind "הצגה", in a row of its own (it names itself). */
function Revealed({ children }: { children: ReactNode }) {
  return (
    <div className="px-4 py-2 not-first:border-line not-first:border-t">
      {children}
    </div>
  );
}

/** A line to look at, in the warning's tone, above the rest of its section. */
function Notice({ children }: { children: ReactNode }) {
  return (
    <p className="bg-warning-soft px-4 py-3 text-pretty text-sm">{children}</p>
  );
}

/**
 * One part of the file, named by its title, so it is a region of its own (a
 * screen reader's, and the browser tests'): PageSection's look, labelled.
 */
function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={`file-${id}`}
      className="flex min-w-0 flex-col gap-3"
    >
      <h2 id={`file-${id}`} className="px-1 font-bold text-lg">
        {title}
      </h2>
      <Card padding="none" className="overflow-hidden">
        {children}
      </Card>
    </section>
  );
}

type OpenProps = {
  t: T;
  wording: AppWording;
  format: Format;
  head: HolderFileHead;
  data: HolderFileData;
  actions: HolderFileActions;
  paths: HolderFilePaths;
  first: string;
};

/**
 * A group missing from the file, or handed straight to payroll: said in its
 * section, with where to send a link from for a reader who sees the team.
 */
function GroupState({
  t,
  data,
  group,
  head,
  first,
}: Pick<OpenProps, "t" | "data" | "head" | "first"> & { group: FileGroup }) {
  if (data.missing.includes(group)) {
    return (
      <Field
        label={t(`team.file.groups.${group}`)}
        hint={
          head.seesTeam ? t("team.file.rows.missingHint", { first }) : undefined
        }
      >
        <span className="text-warning">{t("team.file.rows.missing")}</span>
      </Field>
    );
  }
  if (data.direct.includes(group)) {
    return (
      <Field label={t(`team.file.groups.${group}`)}>
        {t("team.file.rows.direct")}
      </Field>
    );
  }
  return null;
}

/** An address in words: the street or place with its number, the apartment, the town, the zip. */
function addressWords(t: T, address: Address, locale: "he" | "en"): ReactNode {
  const city = cityOf(address.cityCode);
  const parts: string[] = [];
  if (address.kind === "street") {
    parts.push(`${address.street} ${address.number}`);
  } else if (address.kind === "area") {
    parts.push(
      address.number ? `${address.area} ${address.number}` : address.area,
    );
  } else {
    parts.push(t("team.file.rows.poBox", { poBox: address.poBox }));
  }
  if (address.kind !== "poBox" && address.apartment) {
    parts.push(t("team.file.rows.apartment", { apartment: address.apartment }));
  }
  if (city) parts.push(cityName(city, locale));
  return (
    <>
      {parts.join(", ")}
      {address.zip ? (
        <span className="block font-normal text-ink-2 text-sm">
          {t.rich("team.file.rows.zip", { zip: address.zip, ltr })}
        </span>
      ) : null}
    </>
  );
}

function OpenFile(props: OpenProps) {
  const { t, wording, format, head, data, actions, paths, first } = props;
  const locale = wording.locale ?? "he";
  const form = formArg(head.addressForm);
  const tb = translator(wording, "banks");
  const tp = translator(wording, "pensionFunds");
  const countries = new Intl.DisplayNames([locale], { type: "region" });
  const { identity, contact, bank, pension, taxYear } = data;
  const business = head.businessName;

  const bankName = (code: number) => {
    const key = String(code) as Parameters<typeof tb>[0];
    return tb.has(key) ? tb(key) : formatBankCode(code);
  };
  const fundName = (fund: string | null) => {
    const key = (fund ?? "unknown") as Parameters<typeof tp>[0];
    return fund === null || fund === "unknown" || !tp.has(key)
      ? t("team.file.rows.fundUnknown")
      : tp(key);
  };

  /** The account's change to look at, in the person's form of address. */
  const review =
    bank?.review === "new"
      ? t.rich("team.file.review.new", {
          first,
          date: bank.changedAt ? momentOf(format, bank.changedAt) : "",
          ltr,
        })
      : bank?.review === "warned"
        ? t("team.file.review.warned", { first, form })
        : bank?.review === "disputed"
          ? t("team.file.review.disputed", { first, form })
          : null;

  /** The pension's answer in words; nothing while it is missing (said above). */
  const pensionWords = (() => {
    switch (pension.answer) {
      case "existing":
        return t("team.file.rows.pensionExisting", {
          fund: fundName(pension.fund),
        });
      case "new":
        return t("team.file.rows.pensionNew", { fund: fundName(pension.fund) });
      case "employer":
        return t("team.file.rows.pensionEmployer", { business });
      case "later":
        if (pension.dueOn === null) {
          return t("team.file.rows.pensionLaterNone", { first, form });
        }
        return pension.dueOn < data.today
          ? t("team.file.rows.pensionPassed", { business })
          : t.rich("team.file.rows.pensionLater", {
              first,
              form,
              date: dayOf(format, pension.dueOn),
              ltr,
            });
      default:
        return null;
    }
  })();

  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <div
        data-file-grid
        className="grid items-start gap-6 md:grid-cols-2 md:gap-8 xl:grid-cols-3"
      >
        <Section id="identity" title={t("team.file.sections.identity")}>
          <dl>
            <GroupState {...props} group="identity" />
            {identity.legalName ? (
              <Field label={t("team.file.rows.legalName")}>
                {identity.legalName}
              </Field>
            ) : null}
            {identity.kind ? (
              <Field label={t("team.file.rows.document")}>
                {identity.kind === "passport" && identity.country
                  ? t("team.file.rows.passportOf", {
                      country:
                        countries.of(identity.country) ?? identity.country,
                    })
                  : identity.kind === "other" && identity.documentName
                    ? identity.documentName
                    : t("team.file.rows.documentKind", {
                        kind: identity.kind,
                      })}
              </Field>
            ) : null}
            {identity.expiresOn && identity.kind !== "il" ? (
              <Field label={t("team.file.rows.expires")}>
                <span dir="ltr">{dayOf(format, identity.expiresOn)}</span>
              </Field>
            ) : null}
            {identity.birthDate ? (
              <Field
                label={t("team.file.rows.birthDate")}
                hint={
                  identity.youthUntil
                    ? t.rich("team.person.youth", {
                        ltr,
                        until: format.dateTime(
                          new Date(`${identity.youthUntil}T12:00:00Z`),
                          {
                            month: "numeric",
                            year: "numeric",
                            timeZone: "UTC",
                          },
                        ),
                      })
                    : undefined
                }
              >
                <span dir="ltr">{dayOf(format, identity.birthDate)}</span>
              </Field>
            ) : null}
          </dl>
          {identity.masked && identity.kind ? (
            <Revealed>
              <HolderReveal
                field="id"
                label={t("team.file.rows.number", { kind: identity.kind })}
                masked={identity.masked}
                reveal={actions.reveal}
                lockedHref={paths.twin?.locked}
              />
            </Revealed>
          ) : null}
        </Section>

        {contact ? (
          <Section id="contact" title={t("team.file.sections.contact")}>
            <dl>
              <GroupState {...props} group="address" />
              {contact.address ? (
                <Field label={t("team.file.rows.address")}>
                  {addressWords(t, contact.address, locale)}
                </Field>
              ) : null}
              {contact.email ? (
                <Field label={t("team.file.rows.email")}>
                  <span dir="ltr" className="[overflow-wrap:anywhere]">
                    {contact.email}
                  </span>
                </Field>
              ) : null}
              {contact.workLanguage ? (
                <Field label={t("team.file.rows.workLanguage")}>
                  {contact.workLanguage}
                </Field>
              ) : null}
              {contact.emergency ? (
                <Field
                  label={t("team.file.rows.emergency")}
                  hint={
                    <a
                      href={`tel:${contact.emergency.phone}`}
                      dir="ltr"
                      className="inline-flex min-h-11 items-center font-medium text-base text-ink underline underline-offset-4"
                    >
                      {displayIsraeliMobile(contact.emergency.phone)}
                    </a>
                  }
                >
                  {contact.emergency.name}
                </Field>
              ) : null}
            </dl>
          </Section>
        ) : null}

        {bank ? (
          <Section id="bank" title={t("team.file.sections.bank")}>
            {review ? <Notice>{review}</Notice> : null}
            <dl>
              <GroupState {...props} group="bank" />
              {bank.code !== null ? (
                <Field label={t("team.file.rows.bankName")}>
                  {t.rich("team.file.rows.bankOf", {
                    name: bankName(bank.code),
                    code: formatBankCode(bank.code),
                    ltr,
                  })}
                </Field>
              ) : null}
              {bank.branch !== null ? (
                <Field label={t("team.file.rows.branch")}>
                  <span dir="ltr">{bank.branch}</span>
                </Field>
              ) : null}
              {bank.holder ? (
                <Field
                  label={t("team.file.rows.holder")}
                  hint={
                    bank.instructionAt
                      ? t.rich("team.file.rows.instruction", {
                          date: momentOf(format, bank.instructionAt),
                          ltr,
                        })
                      : undefined
                  }
                >
                  {bank.holder === "family"
                    ? t("team.file.rows.holderFamily", {
                        holder: bank.holderName ?? "",
                      })
                    : t("team.file.rows.holderSelf", { first })}
                </Field>
              ) : null}
            </dl>
            {bank.masked ? (
              <Revealed>
                <HolderReveal
                  field="bank_account"
                  label={t("team.file.rows.account")}
                  masked={bank.masked}
                  reveal={actions.reveal}
                  lockedHref={paths.twin?.locked}
                />
              </Revealed>
            ) : null}
          </Section>
        ) : null}

        <Section id="pension" title={t("team.file.sections.pension")}>
          <dl>
            <GroupState {...props} group="pension" />
            {pensionWords ? (
              <Field label={t("team.file.rows.fund")}>{pensionWords}</Field>
            ) : null}
          </dl>
        </Section>

        {data.form101 ? (
          <Section
            id="form101"
            title={t("team.file.sections.form101", { year: data.year })}
          >
            <dl>
              <Field
                label={t("team.file.rows.status")}
                hint={
                  taxYear?.status === "returned" && taxYear.returnedReason
                    ? t("team.file.rows.returnedReason", {
                        reason: taxYear.returnedReason,
                      })
                    : undefined
                }
              >
                {t.rich("team.file.rows.form101", {
                  status: taxYear?.status ?? "none",
                  date: taxYear?.changeDueBy
                    ? dayOf(format, taxYear.changeDueBy)
                    : "",
                  ltr,
                })}
              </Field>
              {taxYear?.route ? (
                <Field label={t("team.file.rows.form101Way")}>
                  {t("team.file.rows.form101Route", {
                    route: taxYear.route,
                    provider: data.form101.provider ?? "",
                  })}
                </Field>
              ) : null}
            </dl>
          </Section>
        ) : null}
      </div>

      <Card className="flex flex-col gap-3 md:max-w-2xl" padding="lg">
        <p className="text-ink-2">
          {data.submittedAt
            ? t.rich("team.file.rows.sent", {
                business,
                date: momentOf(format, data.submittedAt),
                ltr,
              })
            : t("team.file.rows.notSent", { first, form })}
        </p>
        <LockFileButton lock={actions.lock} lockedHref={paths.twin?.locked} />
        <p className="text-ink-2 text-sm">{t("team.file.lock.hint")}</p>
      </Card>
    </div>
  );
}
