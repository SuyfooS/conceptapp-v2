"use client";

import { CHAT_PDF_MAX_BYTES } from "@domain/chat-files";
import { DEMO_DOCUMENT_CATEGORIES } from "@domain/document-files";
import {
  checkDocumentTitle,
  DOCUMENT_CATEGORIES,
  DOCUMENT_NOTE_MAX,
  DOCUMENT_TITLE_MAX,
  type DocumentCategory,
  type DocumentDirection,
} from "@domain/documents";
import { audienceOf, type DocumentAudience } from "@domain/documents-screen";
import { Avatar } from "@ui/avatar";
import { Button } from "@ui/button";
import { ChoiceMenu } from "@ui/choice-menu";
import { ChoiceList, ChoiceRow } from "@ui/choice-row";
import { FieldGroup, GroupedField } from "@ui/field-group";
import { FieldRow } from "@ui/field-row";
import { FileField, type FileFieldChosen } from "@ui/file-field";
import { FloatingAction, floatingButtonClass } from "@ui/floating-action";
import { PageBody, PageHeader } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import {
  encodeDocumentPhoto,
  PhotoReadError,
  PICKED_PHOTO_ACCEPT,
  photoDataUrl,
} from "@ui/photo-encode";
import { Segmented } from "@ui/segmented";
import { Switch } from "@ui/switch";
import { TextArea } from "@ui/text-field";
import { VisibilityNote } from "@ui/visibility-note";
import { Camera, FileText, ImageIcon, Send, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, useId, useRef, useState } from "react";
import { putOutcome, putPdf } from "../../chat-pdfs";
import { categoryIcon, documentSize } from "../document-parts";
import type {
  DocumentSendActions,
  DocumentSendData,
  DocumentSending,
} from "../document-screen-types";
import type {
  DocumentActionFailure,
  DocumentSentResult,
} from "../document-types";
import { documentsPathsAt } from "../documents-paths";

const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;
const PDF_ACCEPT = "application/pdf,.pdf";
const PDF_MB = Math.round(CHAT_PDF_MAX_BYTES / (1024 * 1024));

/** What was picked: a photo made ready on the phone, or a PDF as it is. */
type Picked =
  | { kind: "image"; blob: Blob; preview: string }
  | { kind: "pdf"; file: File; name: string; size: number };

/** Why the screen can't send yet, or why it didn't. */
type Problem =
  | { of: "failure"; key: DocumentActionFailure }
  | { of: "photo"; key: "unreadable" | "tooBig" | "type" }
  | { of: "send"; key: "needsFile" | "needsPeople" }
  /** Its title, checked as the database will before any file goes up. */
  | { of: "title"; key: "needsTitle" | "titleInvalid" };

/** How a PDF goes up, for its bar and its stop. */
type Going = {
  value: number | null;
  text: "uploading" | "checking";
  abort: (() => void) | null;
  upload: string | null;
};

/**
 * `/chat/documents/send` (chat C7, plan §11.6). To the business: which
 * document (a sick note, a form or another), its title (written from its
 * kind until changed), an optional note, and its file: a photo through the
 * camera or the phone's photos, made ready here at 1600 px
 * (`encodeDocumentPhoto`) and sent through the server, or a PDF put in
 * Storage by its signed upload; who sees it, and for a sick note to send that
 * alone. To people: to whom (a person, a department or the whole team, said
 * as a count), the document and its file, and whether to ask for "קראתי".
 * In a demo business the title is the kind's words and there is no note; one
 * that takes no file sends its kind's sample. Once sent, the document's page
 * opens with "ביטול" in a toast.
 */
export function SendDocumentForm({
  data,
  base,
  actions,
  initial,
}: {
  data: DocumentSendData;
  base: string;
  actions: DocumentSendActions;
  /** Where it goes first (`?to=`). */
  initial: DocumentDirection;
}) {
  const t = useTranslations("app.chat.documents");
  const router = useRouter();
  const paths = documentsPathsAt(base);
  const id = useId();
  const samples = data.files === "demo";
  const typed = !data.demo;
  const ways: DocumentDirection[] = [
    ...(data.toBusiness ? (["from_person"] as const) : []),
    ...(data.toPeople ? (["to_people"] as const) : []),
  ];
  const [direction, setDirection] = useState<DocumentDirection>(
    ways.includes(initial) ? initial : (ways[0] ?? "from_person"),
  );
  const categories: readonly DocumentCategory[] = samples
    ? DEMO_DOCUMENT_CATEGORIES[direction]
    : DOCUMENT_CATEGORIES[direction];
  const [category, setCategory] = useState<DocumentCategory>(
    categories[0] ?? "other",
  );
  const [title, setTitle] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [picked, setPicked] = useState<Picked | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [going, setGoing] = useState<Going | null>(null);
  const [audience, setAudience] = useState<DocumentAudience>({
    kind: "person",
    person: null,
  });
  const [asks, setAsks] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [sending, setSending] = useState(false);
  const stopped = useRef(false);
  const titleField = useRef<HTMLInputElement>(null);

  const toPeople = direction === "to_people";
  const shownTitle = title ?? t(`categories.${category}`);
  const people = toPeople
    ? audienceOf(
        audience,
        data.people.map((p) => p.id),
        data.departments,
        data.me,
      )
    : [];
  const nameOf = (person: string | null) =>
    data.people.find((p) => p.id === person)?.name ?? null;
  const chosenDepartment =
    audience.kind === "department"
      ? (data.departments.find((d) => d.id === audience.department)?.name ??
        null)
      : null;

  function chooseWay(next: DocumentDirection) {
    setDirection(next);
    const list = samples
      ? DEMO_DOCUMENT_CATEGORIES[next]
      : DOCUMENT_CATEGORIES[next];
    setCategory(list[0] ?? "other");
    setTitle(null);
    setProblem(null);
  }

  async function pickPhoto(file: File) {
    setProblem(null);
    setPreparing(true);
    try {
      const page = await encodeDocumentPhoto(file);
      setPicked({
        kind: "image",
        blob: page.blob,
        preview: await photoDataUrl(page.blob),
      });
    } catch (error) {
      setPicked(null);
      setProblem({
        of: "photo",
        key: error instanceof PhotoReadError ? error.problem : "unreadable",
      });
    } finally {
      setPreparing(false);
    }
  }

  function pickPdf(file: File) {
    setProblem(null);
    if (file.size > CHAT_PDF_MAX_BYTES) {
      setProblem({ of: "failure", key: "tooBig" });
      return;
    }
    if (file.size === 0) {
      setProblem({ of: "failure", key: "empty" });
      return;
    }
    setPicked({ kind: "pdf", file, name: file.name, size: file.size });
  }

  /** The document's fields as they go. */
  function fields(): DocumentSending {
    return {
      direction,
      category,
      // In a demo business the database writes the kind's words.
      title: typed ? shownTitle : category,
      ...(typed && note.trim() ? { note } : {}),
      ...(toPeople ? { to: people, asks } : {}),
    };
  }

  /**
   * A PDF's place is let go, unless it was sent after all (an answer lost on
   * its way back), which gives its document: one left behind would count
   * against the ten PDFs waiting for two hours. Best effort.
   */
  async function letGo(upload: string): Promise<string | null> {
    try {
      const answer = await actions.cancelPdf({ upload });
      return answer.ok && answer.value.sent ? answer.value.document : null;
    } catch {
      return null;
    }
  }

  /**
   * A PDF's way: its place, its bytes put there (twice at most at the same
   * address, as a network that dropped them may take them again), then the
   * document. A place whose signature no longer holds is let go and made
   * again, once; any place that doesn't end in a document is let go.
   */
  async function sendPdf(
    pdf: Extract<Picked, { kind: "pdf" }>,
  ): Promise<DocumentSentResult | null> {
    for (let round = 0; round < 2; round += 1) {
      const start = await actions.startPdf({
        direction,
        name: pdf.name,
        size: pdf.size,
      });
      if (!start.ok) return start;
      const { upload, signedUrl } = start.value;
      let outcome: ReturnType<typeof putOutcome> = "retry";
      for (let put = 0; put < 2 && !stopped.current; put += 1) {
        const going = putPdf(signedUrl, pdf.file, (fraction) =>
          setGoing((now) =>
            now ? { ...now, value: fraction, text: "uploading" } : now,
          ),
        );
        setGoing({ value: 0, text: "uploading", abort: going.abort, upload });
        outcome = putOutcome(await going.done);
        if (outcome !== "retry") break;
      }
      if (stopped.current) {
        await letGo(upload);
        return null;
      }
      if (outcome !== "done") {
        const sent = await letGo(upload);
        if (sent) return { ok: true, value: { document: sent } };
        if (outcome === "again") continue;
        return {
          ok: false,
          failure: outcome === "tooBig" ? "tooBig" : "failed",
        };
      }
      setGoing({ value: null, text: "checking", abort: null, upload });
      let sent: DocumentSentResult;
      try {
        sent = await actions.finishPdf({ ...fields(), upload });
      } catch {
        sent = { ok: false, failure: "failed" };
      }
      if (sent.ok) return sent;
      // Not sent: its place goes (the server let it go already for most
      // refusals; not for a file that didn't arrive or couldn't be read).
      const after = await letGo(upload);
      if (after) return { ok: true, value: { document: after } };
      if (sent.failure !== "expired") return sent;
    }
    return { ok: false, failure: "failed" };
  }

  async function submit() {
    if (sending) return;
    setProblem(null);
    if (!samples && !picked) {
      setProblem({ of: "send", key: "needsFile" });
      return;
    }
    if (toPeople && people.length === 0) {
      setProblem({ of: "send", key: "needsPeople" });
      return;
    }
    // The title as the database will check it, before any file goes up.
    if (typed) {
      const checked = checkDocumentTitle(shownTitle);
      if (!checked.ok) {
        setProblem({
          of: "title",
          key: checked.reason === "empty" ? "needsTitle" : "titleInvalid",
        });
        titleField.current?.focus();
        return;
      }
    }
    setSending(true);
    stopped.current = false;
    let result: DocumentSentResult | null;
    try {
      if (samples) {
        result = await actions.sample({
          direction,
          category,
          ...(toPeople ? { to: people, asks } : {}),
        });
      } else if (picked?.kind === "image") {
        const form = new FormData();
        form.set(
          "file",
          picked.blob,
          picked.blob.type === "image/jpeg" ? "page.jpg" : "page.webp",
        );
        form.set("document", JSON.stringify(fields()));
        result = await actions.photo(form);
      } else if (picked?.kind === "pdf") {
        result = await sendPdf(picked);
      } else {
        result = null;
      }
    } catch {
      result = { ok: false, failure: "failed" };
    }
    setGoing(null);
    setSending(false);
    if (result === null) return;
    if (!result.ok) {
      setProblem({ of: "failure", key: result.failure });
      if (result.failure === "noAccess" || result.failure === "closed") {
        router.refresh();
      }
      return;
    }
    router.push(paths.sent(result.value.document));
  }

  function stop() {
    stopped.current = true;
    going?.abort?.();
  }

  const titleProblem =
    problem?.of === "title"
      ? problem.key === "needsTitle"
        ? t("send.needsTitle")
        : t.rich("send.titleInvalid", { max: DOCUMENT_TITLE_MAX, ltr })
      : null;
  // A title's problem is said at its field, which takes the focus.
  const problemText = problem
    ? problem.of === "failure"
      ? t(`failure.${problem.key}`)
      : problem.of === "photo"
        ? t(`send.photoFailure.${problem.key}`)
        : problem.of === "title"
          ? null
          : t(`send.${problem.key}`)
    : null;

  const chosen: FileFieldChosen | null =
    picked?.kind === "image"
      ? { kind: "image", src: picked.preview, alt: t("send.chosen") }
      : picked?.kind === "pdf"
        ? {
            kind: "pdf",
            name: picked.name,
            meta: t.rich("page.pdfSize", {
              size: documentSize(picked.size),
              ltr,
            }),
          }
        : null;

  return (
    <PageBody className={pageGlowClass}>
      <PageHeader
        back={{ href: paths.list, label: t("send.back") }}
        title={toPeople ? t("sendToPeople") : t("sendToBusiness")}
      />
      <div className="flex min-w-0 flex-col gap-8 md:max-w-2xl">
        <div className="flex min-w-0 flex-col gap-8">
          {ways.length > 1 ? (
            <section className="flex flex-col gap-3">
              <h2 className="px-1 font-bold text-lg">{t("send.way")}</h2>
              <Segmented
                label={t("send.way")}
                value={direction}
                onChange={chooseWay}
                options={ways.map((way) => ({
                  value: way,
                  label:
                    way === "from_person"
                      ? t("send.toBusiness")
                      : t("send.toPeople"),
                }))}
              />
            </section>
          ) : null}

          {toPeople ? (
            <section className="flex flex-col gap-3">
              <h2 className="px-1 font-bold text-lg">{t("send.to")}</h2>
              <Segmented
                label={t("send.to")}
                value={audience.kind}
                onChange={(kind) => {
                  setProblem(null);
                  setAudience(
                    kind === "person"
                      ? { kind, person: null }
                      : kind === "department"
                        ? { kind, department: null }
                        : { kind },
                  );
                }}
                options={[
                  { value: "person", label: t("send.toPerson") },
                  ...(data.departments.length > 0
                    ? [
                        {
                          value: "department" as const,
                          label: t("send.toDepartment"),
                        },
                      ]
                    : []),
                  { value: "everyone", label: t("send.toEveryone") },
                ]}
              />
              {audience.kind === "person" ? (
                <ChoiceList legend={t("send.person")} legendClassName="sr-only">
                  {data.people.map((person) => (
                    <ChoiceRow
                      key={person.id}
                      name={`${id}-person`}
                      value={person.id}
                      checked={audience.person === person.id}
                      onChange={() => {
                        setProblem(null);
                        setAudience({ kind: "person", person: person.id });
                      }}
                      title={person.name ?? t("noName")}
                      leading={
                        person.name ? (
                          <Avatar name={person.name} photo={person.photo} />
                        ) : (
                          <UserRound />
                        )
                      }
                    />
                  ))}
                </ChoiceList>
              ) : audience.kind === "department" ? (
                <FieldGroup>
                  <FieldRow label={t("send.department")}>
                    <ChoiceMenu
                      label={`${t("send.department")}: ${
                        chosenDepartment ?? t("send.choose")
                      }`}
                      value={audience.department ?? ""}
                      placeholder={t("send.choose")}
                      options={data.departments.map((d) => ({
                        key: d.id,
                        label: d.name,
                      }))}
                      onChange={(department) => {
                        setProblem(null);
                        setAudience({ kind: "department", department });
                      }}
                    />
                  </FieldRow>
                </FieldGroup>
              ) : null}
              <p role="status" className="px-1 text-ink-2">
                {audience.kind === "person" && audience.person
                  ? nameOf(audience.person) === null
                    ? t("row.toNoName")
                    : t("row.toPerson", {
                        name: nameOf(audience.person) ?? "",
                      })
                  : t("send.count", { count: people.length })}
              </p>
            </section>
          ) : null}

          <ChoiceList legend={t("send.category")}>
            {categories.map((key) => (
              <ChoiceRow
                key={key}
                name={`${id}-category`}
                value={key}
                checked={category === key}
                onChange={() => {
                  setCategory(key);
                  setProblem(null);
                }}
                title={t(`categories.${key}`)}
                leading={categoryIcon(key)}
              />
            ))}
          </ChoiceList>
          {category === "sick_note" ? (
            <p className="-mt-5 px-1 font-medium text-ink">
              {t("sickNoteHint")}
            </p>
          ) : null}

          {typed ? (
            <div className="flex flex-col gap-4">
              <FieldGroup>
                <GroupedField
                  ref={titleField}
                  label={t("send.titleLabel")}
                  hint={t("send.titleHint")}
                  error={titleProblem ?? undefined}
                  value={shownTitle}
                  maxLength={DOCUMENT_TITLE_MAX}
                  dir="auto"
                  onChange={(event) => {
                    setTitle(event.target.value);
                    if (problem?.of === "title") setProblem(null);
                  }}
                />
              </FieldGroup>
              <TextArea
                label={t("send.noteLabel")}
                hint={t("send.noteHint")}
                value={note}
                maxLength={DOCUMENT_NOTE_MAX}
                rows={3}
                dir="auto"
                onChange={(event) => setNote(event.target.value)}
              />
            </div>
          ) : (
            <p className="px-1 text-ink-2">{t("send.demo")}</p>
          )}

          {samples ? (
            <p className="px-1 text-ink-2">{t("send.demoSample")}</p>
          ) : (
            <FileField
              legend={t("send.file")}
              hint={t.rich("send.fileHint", { max: PDF_MB, ltr })}
              chosenLabel={t("send.chosen")}
              chosen={chosen}
              preparing={preparing ? t("send.preparing") : null}
              disabled={sending || data.files === "notYet"}
              remove={
                sending
                  ? null
                  : {
                      label: t("send.removeChosen"),
                      onRemove: () => {
                        setPicked(null);
                        setProblem(null);
                      },
                    }
              }
              progress={
                going
                  ? {
                      value: going.value,
                      label: t("send.uploadLabel"),
                      text:
                        going.text === "checking"
                          ? t("send.checking")
                          : t.rich("send.uploading", {
                              percent: Math.round((going.value ?? 0) * 100),
                              ltr,
                            }),
                    }
                  : null
              }
              cancel={
                going?.abort ? { label: t("send.stop"), onCancel: stop } : null
              }
              choices={[
                {
                  key: "camera",
                  icon: <Camera />,
                  label: t("send.camera"),
                  accept: "image/*",
                  capture: "environment",
                  onPick: (file) => void pickPhoto(file),
                },
                {
                  key: "photos",
                  icon: <ImageIcon />,
                  label: t("send.photos"),
                  accept: PICKED_PHOTO_ACCEPT,
                  onPick: (file) => void pickPhoto(file),
                },
                {
                  key: "pdf",
                  icon: <FileText />,
                  label: t("send.pdf"),
                  accept: PDF_ACCEPT,
                  onPick: pickPdf,
                },
              ]}
            />
          )}

          {toPeople ? (
            <FieldGroup>
              <FieldRow
                label={t("askConfirm")}
                hint={t("askConfirmHint")}
                htmlFor={`${id}-asks`}
              >
                <Switch id={`${id}-asks`} checked={asks} onChange={setAsks} />
              </FieldRow>
            </FieldGroup>
          ) : null}

          <VisibilityNote icon="lock">
            {toPeople ? t("whoToPeople") : t("whoFromPerson")}
          </VisibilityNote>

          {problemText ? (
            <p role="alert" className="px-1 font-medium text-danger">
              {problemText}
            </p>
          ) : null}
          {data.files === "notYet" ? (
            <p className="px-1 text-ink-2">{t("failure.notYet")}</p>
          ) : null}

          <FloatingAction>
            <Button
              size="lg"
              loading={sending}
              disabled={data.files === "notYet" || preparing}
              onClick={() => void submit()}
              className={`w-full md:w-auto ${floatingButtonClass}`}
            >
              <Send aria-hidden="true" className="rtl:-scale-x-100" />
              {toPeople ? t("send.submitPeople") : t("send.submitBusiness")}
            </Button>
          </FloatingAction>
        </div>
      </div>
    </PageBody>
  );
}
