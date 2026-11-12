"use client";

import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Card, CardText } from "@ui/card";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageSection } from "@ui/page";
import { StatusToast } from "@ui/status-toast";
import { FileText } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { focusLost } from "../chat-focus";
import { categoryIcon, useDocumentWords } from "./document-parts";
import type { DocumentsTodayData } from "./document-screen-types";
import type { DocumentActionResult } from "./document-types";
import { documentsPathsAt } from "./documents-paths";

const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

/** How many documents to confirm Today shows itself; the rest wait on /chat/documents. */
const SHOWN = 3;

/**
 * Documents' part of Today (chat C7): each document waiting for the person's
 * "קראתי ואישרתי", with a quiet button (Today keeps its own main action) and
 * its page, and how many more wait past those shown; for the office, what
 * came to the business that nobody there opened yet. Nothing for someone
 * with neither. Pressed, a toast says it was given (it outlives the card,
 * which goes as Today is drawn again without it) and the keyboard's focus
 * goes on to the next "קראתי ואישרתי", or to the section's title when none
 * is left, never to the top of the page.
 */
export function TodayDocuments({
  data,
  base,
  confirm,
  className,
}: {
  data: DocumentsTodayData;
  /** Where the documents' screens are (the demo's, on /design/shell). */
  base: string;
  confirm: (document: string) => Promise<DocumentActionResult>;
  className?: string;
}) {
  const words = useDocumentWords(data.people, data.clock);
  const t = words.t;
  const paths = documentsPathsAt(base);
  const heading = useRef<HTMLHeadingElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const shown = data.toConfirm.slice(0, SHOWN);
  const waitingIds = shown.map((document) => document.id).join(" ");
  const waitingNow = useRef(shown.map((document) => document.id));
  useLayoutEffect(() => {
    waitingNow.current = waitingIds ? waitingIds.split(" ") : [];
  }, [waitingIds]);
  /** The one confirmed here, and where it stood. */
  const done = useRef<{ id: string; at: number } | null>(null);
  /** "אישרת שקראת", once per confirmation, after the card it was on. */
  const [said, setSaid] = useState<string | null>(null);
  /** Something was confirmed here: the part stays, saying none is left. */
  const [confirmedHere, setConfirmedHere] = useState(false);

  // Marked as it is pressed: Today may be drawn again without it before the
  // answer is read here.
  const press: Pressing = {
    started(id) {
      done.current = { id, at: Math.max(0, waitingNow.current.indexOf(id)) };
      setConfirmedHere(true);
    },
    confirmed(id) {
      setSaid(`${id}-${Date.now()}`);
    },
    refused(id) {
      if (done.current?.id === id) done.current = null;
    },
  };

  // Drawn again without the one just confirmed: the focus goes on.
  useEffect(() => {
    const was = done.current;
    const now = waitingIds ? waitingIds.split(" ") : [];
    if (!was || now.includes(was.id)) return;
    done.current = null;
    if (!focusLost()) return;
    const next = now[Math.min(was.at, now.length - 1)];
    const button = next
      ? body.current?.querySelector<HTMLElement>(
          `[data-today-document="${CSS.escape(next)}"] [data-document-confirm]`,
        )
      : null;
    (button ?? heading.current)?.focus({ preventScroll: true });
  }, [waitingIds]);

  // Nothing waits: the part goes, unless the last one was confirmed here.
  const empty = data.toConfirm.length === 0 && data.waiting.length === 0;
  if (empty && !confirmedHere) return null;
  const more = Math.max(0, data.toConfirmCount - shown.length);
  return (
    <>
      <StatusToast
        message={said ? t("confirmedNow") : null}
        stamp={said ?? ""}
      />
      <PageSection
        title={t("today.title")}
        headingRef={heading}
        className={className}
        action={
          <Link
            href={paths.list}
            className="-my-2.5 flex min-h-11 items-center rounded-full text-base text-ink-2 focus-visible:outline-2 focus-visible:outline-accent"
          >
            {t("today.all")}
          </Link>
        }
      >
        <div ref={body} className="flex min-w-0 flex-col gap-3">
          {shown.map((document) => (
            <ToConfirm
              key={document.id}
              id={document.id}
              title={document.title}
              icon={categoryIcon(document.category)}
              line={t.rich("today.from", {
                date: words.day(document.sentAt),
                ltr,
              })}
              href={paths.document(document.id)}
              confirm={confirm}
              press={press}
            />
          ))}
          {more > 0 ? (
            <ListGroup>
              <ListRow
                href={paths.list}
                leading={<FileText />}
                title={t("today.moreToConfirm", { count: more })}
              />
            </ListGroup>
          ) : null}
          {empty ? (
            <Card>
              <CardText>{t("today.allConfirmed")}</CardText>
            </Card>
          ) : null}
          {data.waiting.length > 0 ? (
            <ListGroup>
              {data.waiting.slice(0, SHOWN).map((document) => (
                <ListRow
                  key={document.id}
                  href={paths.document(document.id)}
                  leading={categoryIcon(document.category)}
                  title={<span dir="auto">{document.title}</span>}
                  subtitle={
                    words.nameless(document.personId)
                      ? t.rich("today.waitingRowNoName", {
                          date: words.day(document.sentAt),
                          ltr,
                        })
                      : t.rich("today.waitingRow", {
                          name: words.name(document.personId),
                          date: words.day(document.sentAt),
                          ltr,
                        })
                  }
                />
              ))}
              <ListRow
                href={paths.list}
                leading={<FileText />}
                title={t("title")}
                subtitle={t("today.waiting", { count: data.waitingCount })}
              />
            </ListGroup>
          ) : null}
        </div>
      </PageSection>
    </>
  );
}

/** What the part hears of a "קראתי ואישרתי" pressed on one of its cards. */
type Pressing = {
  /** Pressed: Today may be drawn again without it from now on. */
  started: (document: string) => void;
  /** Given: "אישרת שקראת". */
  confirmed: (document: string) => void;
  /** Not given: it stays. */
  refused: (document: string) => void;
};

/** One document waiting for "קראתי ואישרתי", on Today. */
function ToConfirm({
  id,
  title,
  icon,
  line,
  href,
  confirm,
  press,
}: {
  id: string;
  title: string;
  icon: ReactNode;
  line: ReactNode;
  href: string;
  confirm: (document: string) => Promise<DocumentActionResult>;
  press: Pressing;
}) {
  const t = useTranslations("app.chat.documents");
  const router = useRouter();
  const [state, setState] = useState<"waiting" | "pending" | "failed">(
    "waiting",
  );

  async function confirmIt() {
    setState("pending");
    press.started(id);
    let result: DocumentActionResult;
    try {
      result = await confirm(id);
    } catch {
      result = { ok: false, failure: "failed" };
    }
    if (!result.ok) {
      // No longer theirs to confirm: Today is drawn again without it.
      if (result.failure === "noAccess" || result.failure === "closed") {
        router.refresh();
      } else {
        press.refused(id);
      }
      setState("failed");
      return;
    }
    press.confirmed(id);
    router.refresh();
  }

  return (
    <Card data-today-document={id} padding="lg" className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-2 [&_svg]:size-5"
        >
          {icon}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 dir="auto" className="text-start font-semibold text-ink">
            {title}
          </h3>
          <CardText className="text-sm">{line}</CardText>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Badge tone="warning">{t("today.toConfirm")}</Badge>
        <Button
          data-document-confirm=""
          variant="secondary"
          loading={state === "pending"}
          onClick={() => void confirmIt()}
        >
          {t("confirm")}
        </Button>
        <Link
          href={href}
          className="inline-flex min-h-11 items-center font-medium text-ink underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-accent"
        >
          {t("today.openPage")}
        </Link>
      </div>
      {state === "failed" ? (
        <p role="alert" className="text-danger text-sm">
          {t("confirmFailed")}
        </p>
      ) : null}
    </Card>
  );
}
