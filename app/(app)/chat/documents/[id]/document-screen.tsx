"use client";

import {
  DOCUMENT_TAKE_BACK_MINUTES,
  DOCUMENT_UNDO_MINUTES,
  OFFICE_REMOVE_REASONS,
  type OfficeRemoveReason,
} from "@domain/documents";
import { ownMark, recipientsSummary, stateFor } from "@domain/documents-screen";
import { AttachmentChip } from "@ui/attachment-chip";
import { Button } from "@ui/button";
import { Card, CardText, CardTitle } from "@ui/card";
import { ChoiceList, ChoiceRow } from "@ui/choice-row";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { PersonAvatar } from "@ui/person-row";
import { Sheet } from "@ui/sheet";
import { StatusToast } from "@ui/status-toast";
import { VisibilityNote } from "@ui/visibility-note";
import { Trash2, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { focusLost } from "../../chat-focus";
import {
  DocumentStateBadge,
  documentSize,
  useDocumentWords,
} from "../document-parts";
import type {
  DocumentPageActions,
  DocumentPageData,
} from "../document-screen-types";
import type {
  DocumentActionFailure,
  DocumentActionResult,
} from "../document-types";
import { documentsPathsAt } from "../documents-paths";

const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

/** How long a toast's "ביטול" stays (plan §11.7; the database keeps it 10 minutes). */
const UNDO_SHOWN_MS = 10_000;

/**
 * What the toast says. With `focus`, its "ביטול" takes the keyboard's focus
 * as it shows: what was pressed went with the focus (the sheet closing, a
 * button the page no longer has), and the way back is the next thing to
 * reach, waiting while the keyboard is there.
 */
type Toast = {
  text: string;
  stamp: string;
  undo?: () => void;
  focus?: boolean;
};

/** Why the page's last write didn't go: the database's word, or one of its own. */
type PageFailure =
  | DocumentActionFailure
  /** "ביטול השליחה" after its 10 minutes (the database's 22023 for it). */
  | "takeBackLate";

/** Still drawn and shown: somewhere the keyboard's focus can go. */
function shownNow(element: HTMLElement | null): element is HTMLElement {
  if (!element?.isConnected) return false;
  return element.getClientRects().length > 0;
}

/**
 * One document's page (chat C7, plan §11.7): its file (a photo of a page
 * shown as it is, or a PDF to download into the phone's own viewer, "פתיחת
 * הקובץ"), where it stands and its dates, and its note. A recipient asked for
 * "קראתי" has it as the main action. Its sender and the office see the
 * recipients' marks. Its sender takes it back in their first 10 minutes
 * ("ביטול השליחה", and the "ביטול" of the toast after sending); after them
 * the owner or a pay holder deletes its file with a reason from a list, with
 * "ביטול" in a toast for 10 seconds (the database keeps it 10 minutes), and
 * whoever removed it puts it back in that time. The row stays: "הקובץ נמחק:
 * {reason}". The address of its file opens it (and logs the office's
 * opening), so a photo is drawn only here, never in a list.
 */
export function DocumentScreen({
  data,
  base,
  actions,
  justSent,
  openRemoval = false,
}: {
  data: DocumentPageData;
  base: string;
  actions: DocumentPageActions;
  /** Arrived right after sending it (`?sent=1`): its "ביטול" in a toast. */
  justSent: boolean;
  /** Opens with the removal's reasons shown (the design demo's `?state=remove`). */
  openRemoval?: boolean;
}) {
  const words = useDocumentWords(data.people, data.clock);
  const t = words.t;
  const router = useRouter();
  const paths = documentsPathsAt(base);
  const { document, reader } = data;
  const me = reader.id.toLowerCase();
  const state = stateFor(document, reader);
  const mark = ownMark(document, reader);
  const sender = document.authorId?.toLowerCase() === me;
  const [toast, setToast] = useState<Toast | null>(null);
  const [failure, setFailure] = useState<PageFailure | null>(null);
  const [pending, setPending] = useState(false);
  const [sheet, setSheet] = useState(
    openRemoval && data.removable.some((r) => r !== "taken_back"),
  );
  const [reason, setReason] = useState<OfficeRemoveReason | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const removeButton = useRef<HTMLButtonElement>(null);
  const restoreButton = useRef<HTMLButtonElement>(null);
  const takeBackButton = useRef<HTMLButtonElement>(null);
  /**
   * Where the focus goes once the page is drawn again, should what held it
   * have gone with the write ("החזרת הקובץ" once the file is back, "קראתי
   * ואישרתי" once given): the file's way back or on, or the title.
   */
  const refocus = useRef<"file" | "title" | null>(null);
  const reasonsId = useId();
  const sentAt = new Date(document.sentAt);
  const takeBackUntil = new Date(
    sentAt.getTime() + DOCUMENT_TAKE_BACK_MINUTES * 60_000,
  ).toISOString();
  // Its 10 minutes end while the page is open: "ביטול השליחה" goes then.
  const [takeBackOver, setTakeBackOver] = useState(false);
  const takeBack = data.removable.includes("taken_back") && !takeBackOver;
  const officeRemoves = data.removable.some((r) => r !== "taken_back");

  /** The next thing to reach once what held the focus went. */
  function focusOnward(prefer: "file" | "title") {
    const next = (
      prefer === "file"
        ? [
            removeButton.current,
            restoreButton.current,
            takeBackButton.current,
            heading.current,
          ]
        : [heading.current]
    ).find(shownNow);
    next?.focus({ preventScroll: true });
  }

  /**
   * Whether the focus goes with what was just pressed: it fell to the page,
   * or it is in the sheet that is closing, the toast that is leaving, or on
   * a button of the page the write takes away.
   */
  function focusGoes(...going: (HTMLElement | null)[]): boolean {
    const active = window.document.activeElement;
    return (
      focusLost() ||
      (active?.closest('[role="dialog"], [role="status"]') ?? null) !== null ||
      going.some((element) => element !== null && element === active)
    );
  }

  async function run(
    write: () => Promise<DocumentActionResult>,
    late?: PageFailure,
  ): Promise<boolean> {
    setPending(true);
    setFailure(null);
    let result: DocumentActionResult;
    try {
      result = await write();
    } catch {
      result = { ok: false, failure: "failed" };
    }
    setPending(false);
    if (!result.ok) {
      setFailure(late && result.failure === "invalid" ? late : result.failure);
      router.refresh();
      return false;
    }
    return true;
  }

  function restore() {
    void (async () => {
      refocus.current = "file";
      if (await run(() => actions.restore(document.id))) {
        setToast({
          text: t("page.restoredToast"),
          stamp: `restored-${Date.now()}`,
        });
      }
    })();
  }

  function remove(code: "taken_back" | OfficeRemoveReason) {
    void (async () => {
      const goes = focusGoes(removeButton.current, takeBackButton.current);
      const done = await run(
        () => actions.remove(document.id, code),
        // Past its 10 minutes the database says 22023: too late, not wrong.
        code === "taken_back" ? "takeBackLate" : undefined,
      );
      if (!done) {
        if (code === "taken_back") setTakeBackOver(true);
        return;
      }
      setSheet(false);
      setToast({
        text:
          code === "taken_back"
            ? t("page.takenBackToast")
            : t("page.removedToast"),
        stamp: `removed-${Date.now()}`,
        undo: restore,
        focus: goes || focusGoes(removeButton.current, takeBackButton.current),
      });
    })();
  }

  function confirm() {
    void (async () => {
      refocus.current = "title";
      if (await run(() => actions.confirm(document.id))) {
        setToast({
          text: t("confirmedNow"),
          stamp: `confirmed-${Date.now()}`,
        });
      }
    })();
  }

  // Right after sending: "המסמך נשלח", with its "ביטול" while it may be taken
  // back. The address loses its `?sent=1`, so a reload doesn't say it again.
  // Next leaves the focus where it was (the send screen's button, kept
  // hidden for going back): it goes to the toast's "ביטול", or the title.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, as the page opens
  useEffect(() => {
    const lost = focusLost();
    if (justSent) {
      window.history.replaceState(null, "", paths.document(document.id));
    }
    if (justSent && sender) {
      setToast({
        text: t("page.sentToast"),
        stamp: `sent-${document.id}`,
        undo: takeBack ? () => remove("taken_back") : undefined,
        focus: lost && takeBack,
      });
      if (lost && takeBack) return;
    }
    if (lost) heading.current?.focus({ preventScroll: true });
  }, []);

  // "ביטול השליחה" goes once its 10 minutes are over.
  useEffect(() => {
    if (!data.removable.includes("taken_back")) return;
    const left = Date.parse(takeBackUntil) - Date.now();
    const timer = window.setTimeout(
      () => {
        if (window.document.activeElement === takeBackButton.current) {
          refocus.current = "file";
        }
        setTakeBackOver(true);
      },
      Math.max(0, left),
    );
    return () => window.clearTimeout(timer);
  }, [data.removable, takeBackUntil]);

  // Drawn again after a write: the focus goes on if what held it went.
  const removedNow = document.removedAt;
  const stateNow = state;
  // biome-ignore lint/correctness/useExhaustiveDependencies: each time the page is drawn again after a write
  useEffect(() => {
    const prefer = refocus.current;
    if (!prefer) return;
    if (!focusLost()) {
      refocus.current = null;
      return;
    }
    refocus.current = null;
    focusOnward(prefer);
  }, [removedNow, stateNow, data.restorable, takeBackOver]);
  // The database sets both together: a removal and the end of its undo.
  const restoreUntil =
    document.fileGoneAfter ??
    new Date(
      Date.parse(document.removedAt ?? document.sentAt) +
        DOCUMENT_UNDO_MINUTES * 60_000,
    ).toISOString();
  const removed = document.removedAt !== null;
  const toConfirm = state === "toConfirm";

  const only = document.recipients[0]?.personId ?? null;
  const fromLine =
    document.direction === "from_person"
      ? words.nameless(document.personId)
        ? t("page.fromNoName")
        : t("page.from", { name: words.name(document.personId) })
      : mark && !sender
        ? t("page.toMe")
        : document.recipients.length === 1
          ? words.nameless(only)
            ? t("page.toOneNoName")
            : t("page.toOne", { name: words.name(only) })
          : t("page.toMany", { count: document.recipients.length });

  const file = removed ? (
    <CardText>
      {t("removed", { reason: words.reason(document.removedReason) })}
    </CardText>
  ) : document.src === null ? (
    <CardText>{t("page.fileGone")}</CardText>
  ) : document.shownKind === "image" ? (
    // biome-ignore lint/performance/noImgElement: the route serves it, checked again for the reader; next/image would fetch and cache it elsewhere
    <img
      src={document.src}
      alt={t("page.imageAlt", { title: document.title })}
      className="max-h-[75dvh] w-full rounded-control bg-surface-2 object-contain"
    />
  ) : (
    <AttachmentChip
      name={document.fileName ?? `${document.title}.pdf`}
      meta={
        document.fileSize
          ? t.rich("page.pdfSize", {
              size: documentSize(document.fileSize),
              ltr,
            })
          : t("page.pdfPlain")
      }
      href={document.src}
      label={t("open")}
    />
  );

  return (
    <PageBody className={pageGlowClass}>
      <StatusToast
        message={toast?.text ?? null}
        stamp={toast?.stamp}
        duration={toast?.undo ? UNDO_SHOWN_MS : 4000}
        action={
          toast?.undo
            ? {
                label: t("page.undo"),
                onClick: () => {
                  const undo = toast.undo;
                  setToast(null);
                  undo?.();
                },
              }
            : null
        }
        focusAction={toast?.focus === true}
        // The toast went with the focus: on to the file's way back or on.
        onFocusLeave={() => focusOnward("file")}
      />
      <PageHeader
        back={{ href: paths.list, label: t("page.back") }}
        title={<span dir="auto">{document.title}</span>}
        subtitle={`${words.category(document)} · ${fromLine}`}
        headingRef={heading}
        actions={
          toConfirm ? (
            <Button size="lg" loading={pending} onClick={confirm}>
              {t("confirm")}
            </Button>
          ) : !removed && document.src && document.shownKind === "pdf" ? (
            <Button asChild size="lg">
              <a href={document.src} download>
                {t("open")}
              </a>
            </Button>
          ) : undefined
        }
      />

      {failure ? (
        <p role="alert" className="px-1 font-medium text-danger">
          {failure === "takeBackLate"
            ? t("page.takeBackLate")
            : t(`failure.${failure}`)}
        </p>
      ) : null}

      <div className="flex flex-col gap-6 md:grid md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] md:items-start md:gap-8">
        <PageSection title={t("page.file")}>
          <Card padding="lg" className="flex flex-col gap-3">
            {file}
            {document.sample ? (
              <CardText className="text-sm">{t("sample")}</CardText>
            ) : null}
          </Card>
          {toConfirm ? (
            <VisibilityNote>{t("confirmHint")}</VisibilityNote>
          ) : null}
        </PageSection>

        <div className="flex min-w-0 flex-col gap-6">
          <Card padding="lg" className="flex flex-col gap-3">
            <div>
              <DocumentStateBadge
                document={document}
                reader={reader}
                words={words}
              />
            </div>
            <CardText>
              {t.rich("page.sentAt", {
                date: words.day(document.sentAt),
                time: words.time(document.sentAt),
                ltr,
              })}
            </CardText>
            {document.authorId && !sender ? (
              <CardText>
                {t("page.sentBy", { name: words.name(document.authorId) })}
              </CardText>
            ) : null}
            {document.direction === "from_person" ? (
              <CardText>
                {document.openedAt
                  ? t.rich("page.receivedAt", {
                      date: words.day(document.openedAt),
                      time: words.time(document.openedAt),
                      ltr,
                    })
                  : t("page.notOpened")}
              </CardText>
            ) : null}
            {state === "confirmed" && mark?.confirmedAt ? (
              <CardText>
                {t.rich("page.yourMark", {
                  date: words.day(mark.confirmedAt),
                  ltr,
                })}
              </CardText>
            ) : null}
            {removed && document.removedBy ? (
              <CardText>
                {t("page.removedBy", { name: words.name(document.removedBy) })}
              </CardText>
            ) : null}
            {document.note ? (
              <div className="flex flex-col gap-1 border-line border-t pt-3">
                <CardTitle as="h2" className="text-base">
                  {t("page.note")}
                </CardTitle>
                <p
                  dir="auto"
                  className="whitespace-pre-line text-start text-ink"
                >
                  {document.note}
                </p>
              </div>
            ) : null}
          </Card>

          <VisibilityNote icon="lock">
            {document.direction === "from_person"
              ? t("whoFromPerson")
              : t("whoToPeople")}
          </VisibilityNote>

          {document.direction === "to_people" && !(mark && !sender) ? (
            <Recipients data={data} words={words} />
          ) : null}

          {data.restorable ? (
            <div className="flex flex-col items-start gap-1">
              <Button
                ref={restoreButton}
                variant="secondary"
                loading={pending}
                onClick={restore}
              >
                <Undo2 aria-hidden="true" className="rtl:-scale-x-100" />
                {t("page.restore")}
              </Button>
              <span className="px-1 text-ink-2 text-sm">
                {t.rich("page.restoreHint", {
                  time: words.time(restoreUntil),
                  ltr,
                })}
              </span>
            </div>
          ) : takeBack && !removed ? (
            <div className="flex flex-col items-start gap-1">
              <Button
                ref={takeBackButton}
                variant="secondary"
                loading={pending}
                onClick={() => remove("taken_back")}
              >
                <Undo2 aria-hidden="true" className="rtl:-scale-x-100" />
                {t("page.takeBack")}
              </Button>
              <span className="px-1 text-ink-2 text-sm">
                {t.rich("page.takeBackHint", {
                  time: words.time(takeBackUntil),
                  ltr,
                })}
              </span>
            </div>
          ) : null}

          {officeRemoves && !removed ? (
            <Button
              ref={removeButton}
              variant="ghost"
              aria-haspopup="dialog"
              onClick={() => {
                setReason(null);
                setSheet(true);
              }}
              className="self-start text-danger"
            >
              <Trash2 aria-hidden="true" />
              {t("removeFile")}
            </Button>
          ) : null}
        </div>
      </div>

      <Sheet
        open={sheet}
        onOpenChange={setSheet}
        title={t("page.removeTitle")}
        closeLabel={t("page.removeClose")}
        returnFocus={() =>
          [removeButton.current, restoreButton.current, heading.current].find(
            shownNow,
          )
        }
      >
        <div className="flex flex-col gap-4 px-2 pb-2">
          <ChoiceList legend={t("reason")} legendClassName="sr-only">
            {OFFICE_REMOVE_REASONS.map((code) => (
              <ChoiceRow
                key={code}
                name={reasonsId}
                value={code}
                checked={reason === code}
                onChange={() => setReason(code)}
                title={t(`reasons.${code}`)}
              />
            ))}
          </ChoiceList>
          <p className="px-1 text-ink-2 text-sm">{t("page.removeHint")}</p>
          {failure && failure !== "takeBackLate" && sheet ? (
            <p role="alert" className="px-1 text-danger text-sm">
              {t(`failure.${failure}`)}
            </p>
          ) : null}
          <Button
            variant="danger"
            size="lg"
            disabled={reason === null}
            loading={pending}
            onClick={() => {
              if (reason) remove(reason);
            }}
          >
            {t("removeFile")}
          </Button>
        </div>
      </Sheet>
    </PageBody>
  );
}

/** The recipients of a document to people, each with their marks, for its sender and the office. */
function Recipients({
  data,
  words,
}: {
  data: DocumentPageData;
  words: ReturnType<typeof useDocumentWords>;
}) {
  const t = words.t;
  const { document } = data;
  const summary = recipientsSummary(document.recipients);
  return (
    <PageSection
      title={t("page.recipients")}
      action={
        <span className="text-ink-2">
          {t.rich(
            document.asksConfirmation ? "state.confirms" : "state.opens",
            {
              count: document.asksConfirmation
                ? summary.confirmed
                : summary.opened,
              total: summary.total,
              ltr,
            },
          )}
        </span>
      }
    >
      <ListGroup>
        {document.recipients.map((recipient) => {
          const person = data.people[recipient.personId.toLowerCase()];
          const line = recipient.confirmedAt
            ? t.rich("page.markConfirmed", {
                date: words.day(recipient.confirmedAt),
                ltr,
              })
            : recipient.openedAt
              ? document.asksConfirmation
                ? t("page.markUnconfirmed")
                : t.rich("page.markOpened", {
                    date: words.day(recipient.openedAt),
                    ltr,
                  })
              : t("page.markWaiting");
          return (
            <ListRow
              key={recipient.personId}
              leading={
                <PersonAvatar
                  name={person?.name ?? null}
                  photo={person?.photo}
                />
              }
              title={words.name(recipient.personId)}
              subtitle={line}
            />
          );
        })}
      </ListGroup>
    </PageSection>
  );
}
