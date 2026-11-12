"use client";

import {
  DOCUMENT_CATEGORY_KEYS,
  type DocumentCategory,
  type DocumentReader,
} from "@domain/documents";
import {
  type DocumentsDownload,
  documentsDownloadField,
} from "@domain/documents-download";
import {
  DOCUMENT_STATE_FILTERS,
  type DocumentFilters,
  type DocumentShown,
  type DocumentStateFilter,
  isAbout,
  matchesFilters,
  waitsFor,
} from "@domain/documents-screen";
import { Button } from "@ui/button";
import { Card, CardText, CardTitle } from "@ui/card";
import { ChoiceMenu } from "@ui/choice-menu";
import { DataTable } from "@ui/data-table";
import { EmptyState } from "@ui/empty-state";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { PersonAvatar } from "@ui/person-row";
import { Segmented } from "@ui/segmented";
import { Download, FileText, Inbox, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import {
  type ReactNode,
  type Ref,
  type RefObject,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from "react";
import { focusLost } from "../chat-focus";
import {
  categoryIcon,
  DocumentListRow,
  DocumentStateBadge,
  type DocumentWords,
  useDocumentWords,
} from "./document-parts";
import type { DocumentsScreenData } from "./document-screen-types";
import type { DocumentActionResult } from "./document-types";
import { type DocumentsPaths, documentsPathsAt } from "./documents-paths";

const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

/**
 * `/chat/documents` (chat C7, plan §11.5). Someone on the staff sees "המסמכים
 * שלי": their own documents both ways, newest first, each with where it
 * stands, and a sender outside the office also "שלחת", with the recipients'
 * marks; the main action sends a document to the business. The office
 * (owners, pay holders, accountants) sees every document, and sends to
 * people: on a phone "מחכה לך" or "כל המסמכים" by person, one thing at a
 * time; on a tablet the people at the start and the chosen one's documents
 * at the end; on a desktop one table with filters and a preview beside it.
 * The office is told once that the business should keep its own copy, and
 * downloads a person's documents or a month's. A list opens no file: only a
 * document's page, or the desktop's preview of the row chosen, does.
 */
export function DocumentsScreen({
  data,
  base,
  seeNotice,
}: {
  data: DocumentsScreenData;
  /** Where the screens are: the app's `/chat/documents`, or the demo's. */
  base: string;
  /** "הבנתי" on the keep-a-copy notice; the demo's stores nothing. */
  seeNotice: () => Promise<DocumentActionResult>;
}) {
  const t = useTranslations("app.chat.documents");
  const paths = documentsPathsAt(base);
  const words = useDocumentWords(data.people, data.clock);
  const office = data.mode === "office";
  const heading = useRef<HTMLHeadingElement>(null);
  return (
    <PageBody className={pageGlowClass}>
      <PageHeader
        title={office ? t("title") : t("mine")}
        subtitle={office ? t("officeSubtitle") : t("mineSubtitle")}
        headingRef={heading}
        actions={
          <Button asChild size="lg">
            <Link href={paths.send(office ? "people" : "business")}>
              {office ? t("sendToPeople") : t("sendToBusiness")}
            </Link>
          </Button>
        }
      />
      {data.notYet ? (
        <p className="px-1 text-ink-2">{t("failure.notYet")}</p>
      ) : office ? (
        <OfficeDocuments
          data={data}
          paths={paths}
          words={words}
          seeNotice={seeNotice}
          title={heading}
        />
      ) : (
        <StaffDocuments data={data} paths={paths} words={words} />
      )}
    </PageBody>
  );
}

/** "המסמכים שלי", and for a sender "שלחת" beside it from tablet up. */
function StaffDocuments({
  data,
  paths,
  words,
}: {
  data: DocumentsScreenData;
  paths: DocumentsPaths;
  words: DocumentWords;
}) {
  const t = words.t;
  const sent = data.sends ? (data.sent ?? []) : null;
  const mine =
    data.documents.length > 0 ? (
      <ListGroup>
        {data.documents.map((document) => (
          <DocumentListRow
            key={document.id}
            document={document}
            reader={data.reader}
            words={words}
            href={paths.document(document.id)}
          />
        ))}
      </ListGroup>
    ) : (
      <EmptyState
        headingLevel="h2"
        icon={<FileText />}
        body={t("empty.staff")}
        className="py-8"
      />
    );
  return (
    <div
      className={
        sent
          ? "flex flex-col gap-6 md:grid md:grid-cols-2 md:items-start md:gap-8"
          : "flex flex-col gap-6 md:max-w-2xl"
      }
    >
      {/* With "שלחת" beside them, their own get a title of their own. */}
      {sent ? <PageSection title={t("mine")}>{mine}</PageSection> : mine}
      {sent ? (
        <PageSection
          title={t("sent.title")}
          action={
            <Link
              href={paths.send("people")}
              className="-my-2.5 inline-flex min-h-11 items-center font-medium text-ink-2 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-accent"
            >
              {t("sendToPeople")}
            </Link>
          }
        >
          {sent.length > 0 ? (
            <ListGroup>
              {sent.map((document) => (
                <DocumentListRow
                  key={document.id}
                  document={document}
                  reader={data.reader}
                  words={words}
                  href={paths.document(document.id)}
                />
              ))}
            </ListGroup>
          ) : (
            <Card>
              <CardText>{t("sent.empty")}</CardText>
            </Card>
          )}
        </PageSection>
      ) : null}
    </div>
  );
}

/** Still drawn and shown: somewhere the keyboard's focus can go. */
function shownNow(element: HTMLElement | null): element is HTMLElement {
  if (!element?.isConnected) return false;
  return element.getClientRects().length > 0;
}

/** The office's documents, in each device's shape. */
function OfficeDocuments({
  data,
  paths,
  words,
  seeNotice,
  title,
}: {
  data: DocumentsScreenData;
  paths: DocumentsPaths;
  words: DocumentWords;
  seeNotice: () => Promise<DocumentActionResult>;
  /** The page's title: where the focus goes when nothing follows the notice. */
  title: RefObject<HTMLHeadingElement | null>;
}) {
  const t = words.t;
  const reader = data.reader;
  // Everyone the business's documents are about, counted over all of them.
  const people = data.directory;
  const waiting = data.documents.filter((d) => waitsFor(d, reader));
  const chosen = data.person;
  // What follows the notice in each shape: where the focus goes once it is
  // put away, the one shown on this device.
  const phoneNext = useRef<HTMLElement>(null);
  const phonePerson = useRef<HTMLHeadingElement>(null);
  const tabletNext = useRef<HTMLHeadingElement>(null);
  const desktopNext = useRef<HTMLHeadingElement>(null);
  function afterNotice() {
    if (!focusLost()) return;
    const next = [
      phonePerson.current,
      phoneNext.current,
      tabletNext.current,
      desktopNext.current,
      title.current,
    ].find(shownNow);
    next?.focus({ preventScroll: true });
  }
  const notice = (
    <KeepCopyNotice
      shown={data.notice}
      seeNotice={seeNotice}
      onGone={afterNotice}
    />
  );

  if (data.documents.length === 0 && people.length === 0) {
    return (
      <>
        {notice}
        <EmptyState
          headingLevel="h2"
          icon={<FileText />}
          body={t("empty.office")}
          className="py-8"
        />
      </>
    );
  }

  const personRow = (id: string, current: boolean) => {
    const person = people.find((p) => p.id === id);
    const profile = data.people[id];
    return (
      <ListRow
        key={id}
        href={paths.person(id)}
        current={current}
        leading={
          <PersonAvatar name={profile?.name ?? null} photo={profile?.photo} />
        }
        title={words.name(id)}
        subtitle={
          person && person.waiting > 0
            ? t("office.countWaiting", {
                count: person.count,
                waiting: person.waiting,
              })
            : t("office.count", { count: person?.count ?? 0 })
        }
      />
    );
  };

  const rows = (documents: readonly DocumentShown[]) => (
    <ListGroup>
      {documents.map((document) => (
        <DocumentListRow
          key={document.id}
          document={document}
          reader={reader}
          words={words}
          href={paths.document(document.id)}
        />
      ))}
    </ListGroup>
  );

  const waitingList =
    waiting.length > 0 ? (
      rows(waiting)
    ) : (
      <Card>
        <CardText>{t("office.waitingEmpty")}</CardText>
      </Card>
    );

  /** One person's documents, with the download of all of them. */
  const personPane = (id: string, headingRef?: Ref<HTMLHeadingElement>) => {
    const theirs = data.documents.filter((d) => isAbout(d, id));
    const name = words.name(id);
    return (
      <PageSection
        title={t("office.personTitle", { name })}
        headingRef={headingRef}
      >
        {theirs.length > 0 ? (
          rows(theirs)
        ) : (
          <Card>
            <CardText>{t("office.personEmpty", { name })}</CardText>
          </Card>
        )}
        <DownloadButton
          action={paths.download}
          download={{ person: id }}
          label={t("download.person", { name })}
        />
      </PageSection>
    );
  };

  return (
    <>
      {notice}

      {/* Phone: one thing at a time, what waits or everyone by person. */}
      <div className="flex flex-col gap-6 md:hidden">
        {chosen ? (
          <>
            <Link
              href={paths.list}
              className="-my-2 inline-flex min-h-11 items-center self-start font-medium text-ink-2 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-accent"
            >
              {t("office.everyone")}
            </Link>
            {personPane(chosen, phonePerson)}
          </>
        ) : (
          <PhoneSegments
            waitingList={waitingList}
            people={
              <ListGroup>{people.map((p) => personRow(p.id, false))}</ListGroup>
            }
            startWithWaiting={waiting.length > 0}
            words={words}
            sectionRef={phoneNext}
          />
        )}
      </div>

      {/* Tablet: the people at the start, the chosen one's documents at the end. */}
      <div className="hidden md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:items-start md:gap-6 xl:hidden">
        <PageSection title={t("office.people")} headingRef={tabletNext}>
          <ListGroup>
            <ListRow
              href={paths.list}
              current={chosen === null}
              leading={<Inbox />}
              title={t("office.waiting")}
              subtitle={t("office.count", { count: waiting.length })}
            />
            {people.map((p) => personRow(p.id, p.id === chosen))}
          </ListGroup>
        </PageSection>
        {chosen ? (
          personPane(chosen)
        ) : (
          <PageSection title={t("office.waiting")}>{waitingList}</PageSection>
        )}
      </div>

      {/* Desktop: the full picture, one table and its preview. */}
      <DesktopDocuments
        data={data}
        paths={paths}
        words={words}
        people={people.map((p) => p.id)}
        headingRef={desktopNext}
      />

      <MonthDownload data={data} paths={paths} words={words} />
    </>
  );
}

/** The phone's two views of the office's documents. */
function PhoneSegments({
  waitingList,
  people,
  startWithWaiting,
  words,
  sectionRef,
}: {
  waitingList: ReactNode;
  people: ReactNode;
  startWithWaiting: boolean;
  words: DocumentWords;
  /** The view shown: where the focus goes once the notice above is put away. */
  sectionRef: Ref<HTMLElement>;
}) {
  const t = words.t;
  const [shown, setShown] = useState<"waiting" | "all">(
    startWithWaiting ? "waiting" : "all",
  );
  return (
    <>
      <Segmented
        label={t("office.segments")}
        value={shown}
        onChange={setShown}
        options={[
          { value: "waiting", label: t("office.waiting") },
          { value: "all", label: t("office.all") },
        ]}
      />
      <section
        ref={sectionRef}
        tabIndex={-1}
        aria-label={shown === "waiting" ? t("office.waiting") : t("office.all")}
        className="outline-none"
      >
        {shown === "waiting" ? waitingList : people}
      </section>
    </>
  );
}

/** The desktop's table of every document, its filters and its preview. */
function DesktopDocuments({
  data,
  paths,
  words,
  people,
  headingRef,
}: {
  data: DocumentsScreenData;
  paths: DocumentsPaths;
  words: DocumentWords;
  people: string[];
  /** The table's title: where the focus goes once the notice above is put away. */
  headingRef: Ref<HTMLHeadingElement>;
}) {
  const t = words.t;
  const reader = data.reader;
  const router = useRouter();
  const [filters, setFilters] = useState<DocumentFilters>({
    person: data.person,
    category: null,
    state: "all",
  });
  const [selected, setSelected] = useState<string | null>(null);
  const shown = data.documents.filter((d) =>
    matchesFilters(d, filters, reader),
  );
  const preview = shown.find((d) => d.id === selected) ?? null;
  const filtered =
    filters.person !== null ||
    filters.category !== null ||
    filters.state !== "all";
  /** The person's own name, or how many: the next column says which way. */
  const personName = (document: DocumentShown) => {
    if (document.direction === "from_person") {
      return words.name(document.personId);
    }
    const [only, ...more] = document.recipients;
    return only && more.length === 0
      ? words.name(only.personId)
      : t("office.table.people", { count: document.recipients.length });
  };
  /**
   * One person's documents: the address says whose (`?person=`), so the
   * screen reads all of theirs, however old, and the other shapes follow.
   */
  function choosePerson(person: string | null) {
    setFilters((now) => ({ ...now, person }));
    router.replace(person === null ? paths.list : paths.person(person), {
      scroll: false,
    });
  }
  const filter = (label: string, menu: ReactNode) => (
    <span className="inline-flex flex-wrap items-center gap-x-2">
      <span aria-hidden="true" className="text-ink-2">
        {label}
      </span>
      {menu}
    </span>
  );

  return (
    <div className="hidden xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] xl:items-start xl:gap-8">
      <div className="flex min-w-0 flex-col gap-3">
        {/* The table's title, for screen readers and the focus after the notice. */}
        <h2 ref={headingRef} tabIndex={-1} className="sr-only">
          {t("office.table.caption")}
        </h2>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-1">
          <span className="font-medium text-ink">
            {t("office.filters.title")}
          </span>
          {filter(
            t("office.filters.person"),
            <ChoiceMenu
              label={`${t("office.filters.person")}: ${
                filters.person
                  ? words.name(filters.person)
                  : t("office.filters.everyone")
              }`}
              value={filters.person ?? "all"}
              className="text-ink"
              options={[
                { key: "all", label: t("office.filters.everyone") },
                ...people.map((id) => ({ key: id, label: words.name(id) })),
              ]}
              onChange={(key) => choosePerson(key === "all" ? null : key)}
            />,
          )}
          {filter(
            t("office.filters.category"),
            <ChoiceMenu
              label={`${t("office.filters.category")}: ${
                filters.category
                  ? t(`categories.${filters.category}`)
                  : t("office.filters.allCategories")
              }`}
              value={filters.category ?? "all"}
              className="text-ink"
              options={[
                { key: "all", label: t("office.filters.allCategories") },
                ...DOCUMENT_CATEGORY_KEYS.map((key) => ({
                  key,
                  label: t(`categories.${key}`),
                  leading: categoryIcon(key),
                })),
              ]}
              onChange={(key) =>
                setFilters((now) => ({
                  ...now,
                  category:
                    key === "all"
                      ? null
                      : ((DOCUMENT_CATEGORY_KEYS.find((c) => c === key) ??
                          null) as DocumentCategory | null),
                }))
              }
            />,
          )}
          {filter(
            t("office.filters.state"),
            <ChoiceMenu
              label={`${t("office.filters.state")}: ${t(`office.filters.states.${filters.state}`)}`}
              value={filters.state}
              className="text-ink"
              options={DOCUMENT_STATE_FILTERS.map((key) => ({
                key,
                label: t(`office.filters.states.${key}`),
              }))}
              onChange={(key) =>
                setFilters((now) => ({
                  ...now,
                  state:
                    DOCUMENT_STATE_FILTERS.find((s) => s === key) ??
                    ("all" as DocumentStateFilter),
                }))
              }
            />,
          )}
          {filtered ? (
            <button
              type="button"
              onClick={() => {
                setFilters({ person: null, category: null, state: "all" });
                if (filters.person !== null) {
                  router.replace(paths.list, { scroll: false });
                }
              }}
              className="inline-flex min-h-11 items-center font-medium text-ink underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-accent"
            >
              {t("office.filters.clear")}
            </button>
          ) : null}
        </div>
        {shown.length > 0 ? (
          <Card padding="none" className="overflow-hidden">
            <DataTable
              caption={t("office.table.caption")}
              columns={[
                { key: "person", label: t("office.table.person") },
                { key: "title", label: t("office.table.title") },
                { key: "category", label: t("office.table.category") },
                { key: "direction", label: t("office.table.direction") },
                { key: "sent", label: t("office.table.sent"), numeric: true },
                { key: "status", label: t("office.table.status") },
              ]}
              rows={shown.map((document) => {
                // The row's button shows the person, and its name starts
                // with those same words, then says which document and which
                // way it went, so a form sent and the same form sent back
                // read apart.
                const person = personName(document);
                const direction = t(`office.directions.${document.direction}`);
                return {
                  key: document.id,
                  label: t("office.table.rowLabel", {
                    person,
                    title: document.title,
                    direction,
                  }),
                  cells: {
                    person,
                    title: <span dir="auto">{document.title}</span>,
                    category: words.category(document),
                    direction,
                    sent: words.day(document.sentAt),
                    status: (
                      <DocumentStateBadge
                        document={document}
                        reader={reader}
                        words={words}
                      />
                    ),
                  },
                };
              })}
              onSelect={setSelected}
              selected={preview?.id ?? null}
            />
          </Card>
        ) : (
          <Card>
            <CardText>{t("office.filters.noMatch")}</CardText>
          </Card>
        )}
        {filters.person ? (
          <DownloadButton
            action={paths.download}
            download={{ person: filters.person }}
            label={t("download.person", { name: words.name(filters.person) })}
          />
        ) : null}
      </div>
      <aside
        aria-label={t("office.preview.title")}
        className="sticky top-8 flex max-h-[calc(100dvh-4rem)] flex-col gap-3 overflow-y-auto pb-4 [&>*]:shrink-0"
      >
        {preview ? (
          <DocumentPreview
            document={preview}
            reader={reader}
            words={words}
            href={paths.document(preview.id)}
            onClose={() => setSelected(null)}
          />
        ) : (
          <Card className="flex min-h-48 items-center">
            <EmptyState
              headingLevel="h2"
              icon={<FileText />}
              title={t("office.preview.title")}
              body={t("office.preview.choose")}
              className="py-6"
            />
          </Card>
        )}
      </aside>
    </div>
  );
}

/**
 * The desktop's preview of the document chosen in the table: what it is,
 * where it stands and its note, and its file, which this opens (a photo
 * shown here, a PDF to download), as its page does. A removed one's file is
 * never shown, even within its 10 minutes of undo: only why it went.
 */
function DocumentPreview({
  document,
  reader,
  words,
  href,
  onClose,
}: {
  document: DocumentShown;
  reader: DocumentReader;
  words: DocumentWords;
  href: string;
  onClose: () => void;
}) {
  const t = words.t;
  const headingId = useId();
  const removed = document.removedAt !== null;
  const src = removed ? null : document.src;
  return (
    <Card
      padding="lg"
      className="flex flex-col gap-4"
      aria-labelledby={headingId}
    >
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <CardTitle as="h2" id={headingId} dir="auto" className="text-start">
            {document.title}
          </CardTitle>
          <CardText>
            {words.category(document)} ·{" "}
            {t.rich("row.when", {
              who: words.who(document, reader),
              date: words.day(document.sentAt),
              ltr,
            })}
          </CardText>
        </div>
        <Button
          variant="ghost"
          size="md"
          aria-label={t("office.preview.close")}
          title={t("office.preview.close")}
          onClick={onClose}
          className="-me-2 -mt-1 size-11 shrink-0 px-0"
        >
          <X aria-hidden="true" />
        </Button>
      </div>
      <div>
        <DocumentStateBadge document={document} reader={reader} words={words} />
      </div>
      {document.note ? (
        <p dir="auto" className="whitespace-pre-line text-start text-ink">
          {document.note}
        </p>
      ) : null}
      {src && document.shownKind === "image" ? (
        // A photo of a page, shown as it is: the address opens it (and logs
        // the office's opening), so it is drawn only once the row is chosen.
        // biome-ignore lint/performance/noImgElement: the route serves it, checked again for the reader; next/image would fetch and cache it elsewhere
        <img
          src={src}
          alt={t("page.imageAlt", { title: document.title })}
          className="max-h-[60dvh] w-full rounded-control bg-surface-2 object-contain"
        />
      ) : src && document.shownKind === "pdf" ? (
        <Button asChild variant="secondary" className="self-start">
          <a href={src} download>
            <Download aria-hidden="true" />
            {t("open")}
          </a>
        </Button>
      ) : null}
      <Link
        href={href}
        className="inline-flex min-h-11 items-center self-start font-medium text-ink underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-accent"
      >
        {t("office.preview.page")}
      </Link>
    </Card>
  );
}

/**
 * A download of documents: the page's own form, a POST with its one field,
 * never a link (one opens every document in it, so a link anyone could post
 * in a chat must set nothing off); the demo's stand-in where nothing
 * downloads. The browser saves the ZIP and stays on the page.
 */
function DownloadButton({
  action,
  download,
  label,
}: {
  action: string | null;
  download: DocumentsDownload;
  label: string;
}) {
  const field = documentsDownloadField(download);
  const button = (
    <Button
      variant="secondary"
      className="self-start"
      type={action ? "submit" : "button"}
    >
      <Download aria-hidden="true" />
      {label}
    </Button>
  );
  return action ? (
    <form method="post" action={action} className="flex flex-col">
      <input type="hidden" name={field.name} value={field.value} />
      {button}
    </form>
  ) : (
    button
  );
}

/** "הורדת כל המסמכים" of a month: its choice, and the download. */
function MonthDownload({
  data,
  paths,
  words,
}: {
  data: DocumentsScreenData;
  paths: DocumentsPaths;
  words: DocumentWords;
}) {
  const t = words.t;
  const format = useFormatter();
  const [month, setMonth] = useState(data.months[0] ?? null);
  if (!month) return null;
  const monthName = (key: string) => {
    const [year, number] = key.split("-").map(Number);
    return format.dateTime(
      new Date(Date.UTC(year ?? 2026, (number ?? 1) - 1, 15)),
      {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      },
    );
  };
  return (
    <PageSection title={t("downloadAll")} className="md:max-w-2xl">
      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-ink">{t("download.monthLabel")}</span>
          <ChoiceMenu
            label={`${t("download.monthChoose")}: ${monthName(month)}`}
            value={month}
            options={data.months.map((key) => ({
              key,
              label: monthName(key),
            }))}
            onChange={setMonth}
          />
        </div>
        <DownloadButton
          action={paths.download}
          download={{ month }}
          label={t("download.month", { month: monthName(month) })}
        />
        <CardText className="text-sm">
          {t.rich("download.hint", { ltr })}
        </CardText>
      </Card>
    </PageSection>
  );
}

/**
 * The office's one notice that the business keeps its own copy of its
 * official documents (Orel, 11 November 2026: the free plan keeps no
 * backup): "הבנתי" keeps it away for good, in the database, as the
 * download below it does. Once it goes, `onGone` puts the keyboard's focus
 * on what follows it, which held its button.
 */
function KeepCopyNotice({
  shown,
  seeNotice,
  onGone,
}: {
  shown: boolean;
  seeNotice: () => Promise<DocumentActionResult>;
  onGone: () => void;
}) {
  const t = useTranslations("app.chat.documents.notice");
  const [gone, setGone] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();
  const said = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, as it goes
  useEffect(() => {
    if (!gone || said.current) return;
    said.current = true;
    onGone();
  }, [gone]);
  if (!shown || gone) return null;
  return (
    <Card
      tone="accent"
      padding="lg"
      className="flex flex-col gap-3 md:max-w-2xl"
    >
      <CardTitle as="h2">{t("title")}</CardTitle>
      <CardText className="text-ink">{t("body")}</CardText>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          loading={pending}
          onClick={() =>
            start(async () => {
              let result: DocumentActionResult;
              try {
                result = await seeNotice();
              } catch {
                result = { ok: false, failure: "failed" };
              }
              if (result.ok) {
                setFailed(false);
                setGone(true);
              } else {
                setFailed(true);
              }
            })
          }
        >
          {t("ok")}
        </Button>
        {failed ? (
          <span role="alert" className="text-danger text-sm">
            {t("failed")}
          </span>
        ) : null}
      </div>
    </Card>
  );
}
