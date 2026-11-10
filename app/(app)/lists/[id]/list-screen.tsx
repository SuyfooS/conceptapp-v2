"use client";

import {
  type ItemResult,
  isOutOfRange,
  type ListItem,
  listProgress,
  MAX_PASS_NOTE,
  MAX_QUANTITY,
  numberRange,
  parseQuantity,
  parseReading,
  signed,
} from "@domain/lists";
import { timeIn } from "@domain/shabbat";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { ChecklistItem } from "@ui/checklist-item";
import { ChoiceList, ChoiceRow } from "@ui/choice-row";
import { cn } from "@ui/cn";
import { DockButton, FloatingDock } from "@ui/floating-dock";
import { ListGroup } from "@ui/list-row";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { encodeListPhoto, PhotoReadError } from "@ui/photo-encode";
import { ProgressRing } from "@ui/progress-ring";
import { Sheet } from "@ui/sheet";
import { StatusToast } from "@ui/status-toast";
import { TextArea } from "@ui/text-field";
import {
  AlarmClock,
  ArrowLeftRight,
  Building2,
  CheckCheck,
  ChevronDown,
  RotateCcw,
  RotateCw,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  type ReactNode,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { UndoRow } from "../../manage/undo-row";
import { TYPING_MS } from "../../manage/use-draft";
import type {
  ListActionResult,
  ListActions,
  ListFailure,
  ListPhotoFailure,
  ListPhotoResult,
  ListScreenData,
} from "../list-types";

const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

/**
 * What a photo item says went wrong: the server's answer, or the phone's;
 * a removal that didn't happen has its own words.
 */
type PhotoProblem =
  | ListPhotoFailure
  | "unreadable"
  | "offline"
  | "removeOffline"
  | "removeFailed"
  | "removeFinished";
/** The problems a photo item says in its own words; the rest are a list's. */
const PHOTO_WORDS = [
  "demo",
  "empty",
  "tooBig",
  "type",
  "metadata",
  "pixels",
  "unreadable",
  "offline",
  "removeOffline",
  "removeFailed",
  "removeFinished",
  "failed",
  "notYet",
  "finished",
] as const;
type PhotoWord = (typeof PHOTO_WORDS)[number];
const isPhotoWord = (problem: PhotoProblem): problem is PhotoWord =>
  (PHOTO_WORDS as readonly string[]).includes(problem);

/** A photo as the server takes it: a form with the file, named by its type. */
function photoForm(photo: Blob): FormData {
  const form = new FormData();
  form.set(
    "photo",
    photo,
    photo.type === "image/jpeg" ? "photo.jpg" : "photo.webp",
  );
  return form;
}

/** Whether the phone says it has no connection now. */
const offline = () =>
  typeof navigator !== "undefined" && navigator.onLine === false;

/** Why a removal didn't happen, in a removal's own words. */
const removeProblem = (failure: ListPhotoFailure | "offline"): PhotoProblem =>
  failure === "offline"
    ? "removeOffline"
    : failure === "finished"
      ? "removeFinished"
      : failure === "failed"
        ? "removeFailed"
        : failure;

/** A photo prepared but not saved: no connection, or no answer. */
type PhotoWaiting = { bytes: Blob; failure: "offline" | "failed" };

/** The words the server worked out for this list. */
export type ListScreenWords = {
  holder: string;
  due: { tone: "neutral" | "warning"; label: ReactNode } | null;
  /** Why it is only read here, or null when it is being filled. */
  readOnly: ReactNode;
  details: { key: string; label: string; value: ReactNode }[];
  /** What happened, in order; a pass carries the note that came with it. */
  timeline: { key: string; text: ReactNode; note?: string | null }[];
};

/** What an item's result changes, as the screen keeps it. */
type ItemChange = Partial<
  Pick<ListItem, "checked" | "given" | "reading" | "answer" | "comment">
>;

/** A number as it is typed back into its field. */
const typed = (reading: number | null, minus: boolean) =>
  reading === null ? "" : String(minus ? Math.abs(reading) : reading);

/** An order's count as its stepper shows it. */
const countText = (count: number | null) =>
  count === null ? "" : String(count);

/** The range as words: "0–5", "from 0", "up to 5" (`numberRange`). */
const rangeOf = numberRange;

/** An item whose range goes below zero needs a minus sign to be typed. */
const needsMinus = (item: ListItem) =>
  item.kind === "number" &&
  ((item.min !== null && item.min < 0) || (item.max !== null && item.max < 0));

/**
 * A list being filled. A tick saves at once and shows at once, and goes back
 * with a word if it didn't save; ticking again is the undo. A number saves on
 * leaving its field or on Enter, a note on leaving it, a comment from its
 * sheet. On an order a tick gives what was asked for, and a stepper under it
 * says how many were given (L5). "Finish the list" waits for the required
 * items; once it's finished, whoever finished it can take it back for five
 * minutes. Whoever holds it, or manages lists, passes it to another
 * department from a sheet, with a note. A photo item (L6) takes a photo with
 * the phone's camera or from its photos, re-encoded here, shown at once while
 * it saves, said in words when it can't be (too big, not a photo, a demo
 * business), kept with a way to try again when it didn't get there (no
 * connection, no answer), replaced, or removed with an undo that puts the
 * same photo back; the list waits to be finished while a photo is on its
 * way. Phone: the list and the dock, the
 * timeline folded at the end. Tablet: the items beside the details and the
 * timeline. Desktop: the same, the main action in the header, and the
 * readings as a table.
 */
export function ListScreen({
  data,
  actions,
  backHref,
  words,
}: {
  data: ListScreenData;
  actions: ListActions;
  backHref: string;
  words: ListScreenWords;
}) {
  const t = useTranslations("app.lists");
  const tl = useTranslations("app.lists.list");
  const router = useRouter();
  const { list, lookups, userId, timeZone, can } = data;
  const [items, setItems] = useState<ListItem[]>(list.items);
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      list.items.map((item) => [
        item.id,
        item.kind === "number"
          ? typed(item.reading, needsMinus(item) && (item.reading ?? 0) < 0)
          : (item.answer ?? ""),
      ]),
    ),
  );
  // Minus starts on for a reading below zero, or, before one, for a range
  // wholly below zero (a freezer).
  const [minus, setMinus] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      list.items
        .filter(needsMinus)
        .map((item) => [
          item.id,
          item.reading !== null
            ? item.reading < 0
            : item.max !== null && item.max < 0,
        ]),
    ),
  );
  const [failure, setFailure] = useState<{
    reason: ListFailure;
    stamp: number;
  } | null>(null);
  const [commentFor, setCommentFor] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [finishing, startFinish] = useTransition();
  const [undoShown, setUndoShown] = useState(data.undoUntil !== null);
  const latest = useRef<Record<string, number>>({});
  // An order's counts given, as typed, and the save each waits for after the
  // last tap of its stepper.
  const [givenDrafts, setGivenDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      list.items.map((item) => [item.id, countText(item.given)]),
    ),
  );
  const givenTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // Passing it on: the sheet, the department chosen, its note, and the word
  // that it went.
  const [passOpen, setPassOpen] = useState(false);
  const [passTo, setPassTo] = useState<string | null>(null);
  const [passNote, setPassNote] = useState("");
  const [passFailure, setPassFailure] = useState<ListFailure | null>(null);
  const [passed, setPassed] = useState<{ name: string; stamp: number } | null>(
    null,
  );
  const [passing, startPass] = useTransition();
  // Photo items (L6): what each is doing now (preparing the photo, saving it,
  // removing it), its photo while it saves, why the last one didn't go, the
  // photo that didn't get there, kept to try again, the removed photo's
  // bytes for its undo, and the word that one was saved.
  const [photoBusy, setPhotoBusy] = useState<
    Record<string, "preparing" | "saving" | "removing">
  >({});
  const [photoPreview, setPhotoPreview] = useState<Record<string, string>>({});
  const [photoProblem, setPhotoProblem] = useState<
    Record<string, PhotoProblem>
  >({});
  const [photoWaiting, setPhotoWaiting] = useState<
    Record<string, PhotoWaiting>
  >({});
  const [photoUndo, setPhotoUndo] = useState<{
    itemId: string;
    bytes: Blob;
    failed: boolean;
  } | null>(null);
  const [photoUndoing, setPhotoUndoing] = useState(false);
  const [photoSaved, setPhotoSaved] = useState<number | null>(null);
  // Counts each item's picks: one that finishes after a newer one changes nothing.
  const photoPicks = useRef<Record<string, number>>({});
  // The same previews, for their addresses to go as soon as they are done.
  const previews = useRef<Record<string, string>>({});
  // A photo shown while it saved lives as long as the screen, at most.
  useEffect(
    () => () => {
      for (const url of Object.values(previews.current)) {
        URL.revokeObjectURL(url);
      }
    },
    [],
  );

  // The newest items and counts typed, for a count saved after its timer.
  const itemsNow = useRef(items);
  const givenNow = useRef(givenDrafts);
  useEffect(() => {
    itemsNow.current = items;
  }, [items]);
  useEffect(() => {
    givenNow.current = givenDrafts;
  }, [givenDrafts]);

  // Leaving with a count still waiting saves it on the way out.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only on leaving, with the newest counts (read from refs)
  useEffect(
    () => () => {
      for (const itemId of Object.keys(givenTimers.current)) {
        commitGiven(itemId);
      }
    },
    [],
  );

  // The undo goes away by itself when its five minutes are up, counted from
  // the server's clock (`now`): a phone whose clock is off, or the demo's
  // fixed morning, still gets the time the server gave.
  useEffect(() => {
    if (!data.undoUntil) return;
    const left = Date.parse(data.undoUntil) - Date.parse(data.now);
    const timer = setTimeout(() => setUndoShown(false), Math.max(0, left));
    return () => clearTimeout(timer);
  }, [data.undoUntil, data.now]);

  const progress = listProgress(items);
  const fill = can.fill;

  function fail(reason: ListFailure) {
    setFailure({ reason, stamp: Date.now() });
    // Closed meanwhile, or moved on elsewhere: show where it really stands.
    if (reason === "finished" || reason === "noAccess") router.refresh();
  }

  /** What an item's result is with this change, for `set_list_item`. */
  function resultOf(item: ListItem, change: ItemChange): ItemResult {
    const next = { ...item, ...change };
    const result: NonNullable<ItemResult> = {};
    if (item.kind === "check" && next.checked) {
      // An order's count says it was ticked; a tick alone gives what was
      // asked for.
      if (list.asksQuantities && next.given !== null) result.given = next.given;
      else result.checked = true;
    }
    if (item.kind === "number" && next.reading !== null) {
      result.reading = next.reading;
    }
    if (item.kind === "note" && next.answer) result.answer = next.answer;
    if (next.comment) result.comment = next.comment;
    return Object.keys(result).length > 0 ? result : null;
  }

  /** Shows the change at once, saves it, and puts it back if it didn't save. */
  async function save(item: ListItem, change: ItemChange): Promise<boolean> {
    const before = item;
    // On an order, a tick gives what was asked for, and taking it back
    // gives none, as the database has it.
    const counted: ItemChange =
      item.kind === "check" && list.asksQuantities && "checked" in change
        ? {
            given: change.checked
              ? (change.given ?? item.given ?? item.requested)
              : null,
          }
        : {};
    const result = resultOf(item, { ...change, ...counted });
    const next: ListItem = { ...item, ...change, ...counted };
    const done =
      item.kind === "check"
        ? next.checked
        : item.kind === "number"
          ? next.reading !== null
          : item.kind === "note"
            ? next.answer !== null
            : item.done;
    // The database writes who saved it last, and when, as here; a photo's
    // comment leaves who took it (`set_list_item`).
    const shown: ListItem =
      item.kind === "photo"
        ? next
        : {
            ...next,
            done,
            doneBy: done ? userId : null,
            doneAt: done ? new Date().toISOString() : null,
          };
    const mine = (latest.current[item.id] ?? 0) + 1;
    latest.current[item.id] = mine;
    setItems((current) => current.map((i) => (i.id === item.id ? shown : i)));
    const ordered = item.kind === "check" && list.asksQuantities;
    if (ordered) {
      setGivenDrafts((current) => ({
        ...current,
        [item.id]: countText(next.given),
      }));
    }
    let saved: ListActionResult<unknown>;
    try {
      saved = await actions.setItem(item.id, result);
    } catch {
      saved = { ok: false, failure: "failed" };
    }
    if (saved.ok) return true;
    // A later change to the same item has the last word.
    if (latest.current[item.id] === mine) {
      setItems((current) =>
        current.map((i) => (i.id === item.id ? before : i)),
      );
      setDrafts((current) => ({
        ...current,
        [item.id]:
          item.kind === "number"
            ? typed(before.reading, minus[item.id] ?? false)
            : (before.answer ?? ""),
      }));
      if (ordered) {
        setGivenDrafts((current) => ({
          ...current,
          [item.id]: countText(before.given),
        }));
      }
    }
    fail(saved.failure);
    return false;
  }

  /**
   * An order's count given, as it is typed or stepped: saved shortly after
   * the last change, or on leaving the field (`commitGiven`).
   */
  function changeGiven(item: ListItem, value: string) {
    setGivenDrafts((current) => ({ ...current, [item.id]: value }));
    const waiting = givenTimers.current[item.id];
    if (waiting) clearTimeout(waiting);
    givenTimers.current[item.id] = setTimeout(
      () => commitGiven(item.id),
      TYPING_MS,
    );
  }

  function commitGiven(itemId: string) {
    const waiting = givenTimers.current[itemId];
    if (waiting) clearTimeout(waiting);
    delete givenTimers.current[itemId];
    const item = itemsNow.current.find((i) => i.id === itemId);
    if (!item) return;
    const text = givenNow.current[itemId] ?? "";
    const given = parseQuantity(text);
    if (given === null) {
      // Not a count: back to what it was, and said.
      setGivenDrafts((drafts) => ({
        ...drafts,
        [itemId]: countText(item.given),
      }));
      if (text.trim() !== "") fail("invalid");
      return;
    }
    if (given !== item.given) void save(item, { given });
  }

  function commitNumber(item: ListItem) {
    const text = (drafts[item.id] ?? "").trim();
    if (text === "") {
      if (item.reading !== null) void save(item, { reading: null });
      return;
    }
    const parsed = parseReading(text);
    if (parsed === null) {
      setDrafts((current) => ({
        ...current,
        [item.id]: typed(item.reading, minus[item.id] ?? false),
      }));
      fail("invalid");
      return;
    }
    const reading = minus[item.id] ? -Math.abs(parsed) : parsed;
    if (reading !== item.reading) void save(item, { reading });
  }

  function toggleMinus(item: ListItem) {
    const on = !(minus[item.id] ?? false);
    setMinus((current) => ({ ...current, [item.id]: on }));
    const parsed = parseReading(drafts[item.id] ?? "");
    if (parsed === null) return;
    const reading = on ? -Math.abs(parsed) : Math.abs(parsed);
    if (reading !== item.reading) void save(item, { reading });
  }

  function commitNote(item: ListItem) {
    const text = (drafts[item.id] ?? "").trim();
    const answer = text === "" ? null : text;
    if (answer !== item.answer) void save(item, { answer });
  }

  function openComment(item: ListItem) {
    setCommentDraft(item.comment ?? "");
    setCommentFor(item.id);
  }

  async function saveComment() {
    const item = items.find((i) => i.id === commentFor);
    if (!item) return;
    const text = commentDraft.trim();
    setCommentFor(null);
    const comment = text === "" ? null : text;
    if (comment !== item.comment) await save(item, { comment });
  }

  // Photos ----------------------------------------------------------------

  function busyWith(
    itemId: string,
    doing: "preparing" | "saving" | "removing" | null,
  ) {
    setPhotoBusy((current) => {
      const { [itemId]: _, ...rest } = current;
      return doing ? { ...rest, [itemId]: doing } : rest;
    });
  }

  function problemFor(itemId: string, problem: PhotoProblem | null) {
    setPhotoProblem((current) => {
      const { [itemId]: _, ...rest } = current;
      return problem ? { ...rest, [itemId]: problem } : rest;
    });
  }

  /** Shows a photo being saved in place of the item's, or stops; the old one's address goes. */
  function previewFor(itemId: string, url: string | null) {
    const { [itemId]: old, ...rest } = previews.current;
    if (old && old !== url) URL.revokeObjectURL(old);
    const next = url ? { ...rest, [itemId]: url } : rest;
    previews.current = next;
    setPhotoPreview(next);
  }

  /** The item as it is now that its photo changed: done by this person, or not. */
  function photoChanged(itemId: string, photo: string | null) {
    const at = new Date().toISOString();
    setItems((current) =>
      current.map((i) =>
        i.id === itemId
          ? {
              ...i,
              photo,
              photoRemoved: false,
              done: photo !== null,
              doneBy: photo !== null ? userId : null,
              doneAt: photo !== null ? at : null,
            }
          : i,
      ),
    );
  }

  /** What a photo write answers, or "offline"/"failed" when it didn't arrive. */
  async function photoAnswer(
    run: () => Promise<ListPhotoResult>,
  ): Promise<ListPhotoResult | { ok: false; failure: "offline" }> {
    if (offline()) return { ok: false, failure: "offline" };
    try {
      return await run();
    } catch {
      return { ok: false, failure: offline() ? "offline" : "failed" };
    }
  }

  /** A new attempt for the item's photo; one that ends after a newer one changes nothing. */
  function nextPick(itemId: string): () => boolean {
    const mine = (photoPicks.current[itemId] ?? 0) + 1;
    photoPicks.current[itemId] = mine;
    return () => photoPicks.current[itemId] === mine;
  }

  /** The photo kept to try again goes (saved, replaced, or refused for good). */
  function waitingFor(itemId: string, waiting: PhotoWaiting | null) {
    setPhotoWaiting((current) => {
      const { [itemId]: _, ...rest } = current;
      return waiting ? { ...rest, [itemId]: waiting } : rest;
    });
  }

  /**
   * A photo taken or chosen: re-encoded here first (`encodeListPhoto`), so
   * what leaves the phone is about 0.3 MB with nothing from the camera inside,
   * shown at once while it saves, and said when it can't be.
   */
  async function pickPhoto(item: ListItem, file: File) {
    const current = nextPick(item.id);
    problemFor(item.id, null);
    // A new photo takes the place of one that didn't get there.
    waitingFor(item.id, null);
    previewFor(item.id, null);
    if (photoUndo?.itemId === item.id) setPhotoUndo(null);
    busyWith(item.id, "preparing");
    let blob: Blob;
    try {
      blob = await encodeListPhoto(file);
    } catch (error) {
      if (!current()) return;
      busyWith(item.id, null);
      problemFor(
        item.id,
        error instanceof PhotoReadError ? error.problem : "unreadable",
      );
      return;
    }
    if (!current()) return;
    previewFor(item.id, URL.createObjectURL(blob));
    await uploadPhoto(item.id, blob, current);
  }

  /**
   * Saves a prepared photo, shown while it saves. One that didn't get there
   * (no connection, or no answer) stays on the screen with its bytes, and the
   * way to try again with them, rather than asking for it again; one refused
   * for good goes, and says why.
   */
  async function uploadPhoto(
    itemId: string,
    blob: Blob,
    current: () => boolean,
  ) {
    busyWith(itemId, "saving");
    const result = await photoAnswer(() =>
      actions.setPhoto(itemId, photoForm(blob)),
    );
    if (!current()) return;
    busyWith(itemId, null);
    if (!result.ok) {
      const { failure } = result;
      if (failure === "offline" || failure === "failed") {
        waitingFor(itemId, { bytes: blob, failure });
        return;
      }
      previewFor(itemId, null);
      problemFor(itemId, failure);
      // Closed meanwhile, or no longer theirs: show where it really stands.
      if (failure === "finished" || failure === "noAccess") router.refresh();
      return;
    }
    previewFor(itemId, null);
    photoChanged(itemId, result.value.photo);
    setPhotoSaved(Date.now());
  }

  /** The photo that didn't get there, sent again as it was. */
  function retryPhoto(itemId: string) {
    const waiting = photoWaiting[itemId];
    if (!waiting) return;
    const current = nextPick(itemId);
    waitingFor(itemId, null);
    problemFor(itemId, null);
    void uploadPhoto(itemId, waiting.bytes, current);
  }

  /**
   * Removing a photo reads its bytes first, from the address the screen
   * shows: without them there would be nothing to bring back, so nothing is
   * removed. The undo then sets them again.
   */
  async function removePhoto(item: ListItem) {
    const shown = item.photo;
    if (!shown) return;
    problemFor(item.id, null);
    busyWith(item.id, "removing");
    let kept: Blob;
    try {
      const response = await fetch(shown);
      if (!response.ok) throw new Error(String(response.status));
      kept = await response.blob();
    } catch {
      busyWith(item.id, null);
      problemFor(item.id, offline() ? "removeOffline" : "removeFailed");
      return;
    }
    const result = await photoAnswer(() => actions.removePhoto(item.id));
    busyWith(item.id, null);
    if (!result.ok) {
      problemFor(item.id, removeProblem(result.failure));
      if (result.failure === "finished" || result.failure === "noAccess") {
        router.refresh();
      }
      return;
    }
    photoChanged(item.id, null);
    setPhotoUndo({ itemId: item.id, bytes: kept, failed: false });
  }

  async function bringPhotoBack() {
    const undo = photoUndo;
    if (!undo || photoUndoing) return;
    setPhotoUndoing(true);
    const result = await photoAnswer(() =>
      actions.setPhoto(undo.itemId, photoForm(undo.bytes)),
    );
    setPhotoUndoing(false);
    if (result.ok) {
      setPhotoUndo(null);
      photoChanged(undo.itemId, result.value.photo);
      setPhotoSaved(Date.now());
    } else if (result.failure === "failed" || result.failure === "offline") {
      // It didn't get there: the row stays, saying so, and "ביטול" tries again.
      setPhotoUndo({ ...undo, failed: true });
    } else {
      // Refused for good (closed meanwhile, a demo): the row goes and says why.
      setPhotoUndo(null);
      problemFor(undo.itemId, result.failure);
    }
  }

  const photoWords = (problem: PhotoProblem): string =>
    isPhotoWord(problem)
      ? tl(`photo.failures.${problem}`)
      : tl(`failed.${problem}`);

  /** A photo item's part, as this person may fill it or only read it. */
  const photoOf = (item: ListItem) => {
    const busy = photoBusy[item.id];
    const problem = photoProblem[item.id];
    const waiting = busy ? undefined : photoWaiting[item.id];
    const taking = data.photos.taking;
    return {
      src: photoPreview[item.id] ?? item.photo,
      alt: tl("photo.alt", { label: item.label }),
      empty: item.photoRemoved
        ? tl("photo.removedAfter")
        : fill
          ? null
          : tl("photo.none"),
      busy: busy ? tl(`photo.${busy}`) : null,
      problem: problem ? photoWords(problem) : null,
      locked: fill && taking !== "yes" ? tl(`photo.${taking}`) : null,
      take: fill
        ? {
            label: tl("photo.take"),
            replaceLabel: tl("photo.replace"),
            hint: tl("photo.takeHint"),
            onPick: (file: File) => void pickPhoto(item, file),
          }
        : null,
      // A photo that didn't get there isn't stored: it is tried again, or
      // replaced, rather than removed.
      remove:
        fill && !waiting
          ? {
              label: tl("photo.remove"),
              onRemove: () => void removePhoto(item),
            }
          : null,
      after: waiting ? (
        <div className="flex min-h-[3.25rem] items-center justify-between gap-3 rounded-card bg-surface-2 ps-4 pe-1.5">
          <p role="alert" className="min-w-0 py-2 text-base">
            {tl(`photo.failures.${waiting.failure}`)}
          </p>
          <Button
            variant="ghost"
            aria-label={`${tl("photo.retry")}: ${item.label}`}
            onClick={() => retryPhoto(item.id)}
            className="shrink-0"
          >
            <RotateCw aria-hidden="true" />
            {tl("photo.retry")}
          </Button>
        </div>
      ) : photoUndo?.itemId === item.id ? (
        <UndoRow
          message={
            photoUndo.failed ? tl("photo.undoFailed") : tl("photo.removed")
          }
          onUndo={() => void bringPhotoBack()}
          pending={photoUndoing}
        />
      ) : null,
    };
  };

  // A photo on its way (prepared, saved, removed or brought back): the list
  // waits for it to be finished, so the photo isn't lost.
  const photosBusy = Object.keys(photoBusy).length > 0 || photoUndoing;

  function finish() {
    if (photosBusy) return;
    startFinish(async () => {
      let result: ListActionResult;
      try {
        result = await actions.finish(list.id);
      } catch {
        result = { ok: false, failure: "failed" };
      }
      if (!result.ok) fail(result.failure);
    });
  }

  function reopen() {
    startFinish(async () => {
      let result: ListActionResult;
      try {
        result = await actions.reopen(list.id);
      } catch {
        result = { ok: false, failure: "failed" };
      }
      if (!result.ok) fail(result.failure);
    });
  }

  const passTarget = data.pass?.targets.find((d) => d.id === passTo) ?? null;

  function openPass() {
    setPassTo(null);
    setPassNote("");
    setPassFailure(null);
    setPassOpen(true);
  }

  function pass() {
    const target = passTarget;
    if (!target || !data.pass) return;
    const stays = data.pass.stays;
    startPass(async () => {
      let result: ListActionResult;
      try {
        result = await actions.pass(list.id, target.id, passNote.trim());
      } catch {
        result = { ok: false, failure: "failed" };
      }
      if (!result.ok) {
        setPassFailure(result.failure);
        return;
      }
      setPassOpen(false);
      // Still theirs to read: the screen shows where it went, and says so.
      // Otherwise, back to their lists, which say so (`?passed=`): this
      // screen, and its word, leave.
      if (stays) {
        setPassed({ name: target.name, stamp: Date.now() });
        router.refresh();
      } else {
        router.push(`${backHref}?passed=${target.id}`);
      }
    });
  }

  const doneLine = (item: ListItem) =>
    item.doneAt
      ? t.rich("list.doneBy", {
          name:
            (item.doneBy && lookups.people[item.doneBy]?.name) || t("noName"),
          time: timeIn(new Date(item.doneAt), timeZone),
          ltr,
        })
      : null;

  const hintOf = (item: ListItem): ReactNode => {
    const parts: ReactNode[] = [];
    if (item.hint) parts.push(item.hint);
    if (list.asksQuantities && item.requested !== null) {
      parts.push(tl("requested", { count: item.requested }));
    }
    return parts.length > 0 ? parts.join(" · ") : undefined;
  };

  const finishButton = (className?: string) => (
    <Button
      size="lg"
      loading={finishing}
      disabled={progress.requiredLeft > 0 || photosBusy}
      onClick={finish}
      className={className}
    >
      <CheckCheck aria-hidden="true" />
      {tl("finish")}
    </Button>
  );

  const leftWords =
    progress.requiredLeft > 0
      ? tl("leftRequired", { count: progress.requiredLeft })
      : photosBusy
        ? tl("photoStillSaving")
        : tl("readyToFinish");

  const numbers = items.filter((item) => item.kind === "number");

  const timeline = (
    <ol className="flex flex-col gap-3">
      {words.timeline.map((entry) => (
        <li key={entry.key} className="flex items-start gap-3 text-base">
          <span
            aria-hidden="true"
            className="mt-2 size-2 shrink-0 rounded-full bg-accent"
          />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span>{entry.text}</span>
            {entry.note ? (
              <span className="whitespace-pre-line text-ink-2 text-sm">
                {entry.note}
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ol>
  );

  /** An order's check: how many were given, beside what was asked for. */
  const quantityOf = (item: ListItem) => {
    if (!list.asksQuantities || item.kind !== "check") return null;
    const given = item.given;
    const short =
      given !== null && item.requested !== null && given < item.requested
        ? tl("short", { count: item.requested - given })
        : null;
    return {
      label: tl("givenLabel"),
      value: givenDrafts[item.id] ?? "",
      onValueChange: (value: string) => changeGiven(item, value),
      onCommit: () => commitGiven(item.id),
      fieldLabel: tl("givenOf", { label: item.label }),
      decreaseLabel: tl("fewer", { label: item.label }),
      increaseLabel: tl("more", { label: item.label }),
      max: MAX_QUANTITY,
      short,
      text:
        given === null
          ? null
          : item.requested !== null
            ? tl("given", { given, requested: item.requested })
            : tl("givenOnly", { count: given }),
    };
  };

  return (
    <PageBody className={pageGlowClass}>
      <StatusToast
        message={failure ? tl(`failed.${failure.reason}`) : null}
        stamp={failure ? String(failure.stamp) : undefined}
      />
      <StatusToast
        message={passed ? tl("pass.passed", { name: passed.name }) : null}
        stamp={passed ? String(passed.stamp) : undefined}
      />
      <StatusToast
        message={photoSaved ? tl("photo.saved") : null}
        stamp={photoSaved ? String(photoSaved) : undefined}
      />
      <PageHeader
        back={{ href: backHref, label: t("title") }}
        title={list.name}
        subtitle={words.holder}
        actions={
          fill ? (
            <div className="hidden xl:flex">{finishButton()}</div>
          ) : can.reopen && !undoShown ? (
            <Button
              variant="secondary"
              size="lg"
              loading={finishing}
              onClick={reopen}
            >
              <RotateCcw aria-hidden="true" />
              {tl("reopen")}
            </Button>
          ) : null
        }
      />

      {undoShown && list.status !== "open" ? (
        <UndoRow
          message={
            list.status === "cancelled" ? tl("cancelled") : tl("finished")
          }
          onUndo={reopen}
          pending={finishing}
        />
      ) : null}

      <div className="grid items-start gap-6 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:gap-8">
        <div className="flex min-w-0 flex-col gap-6">
          <section aria-label={tl("progressLabel")}>
            <Card tone="hero" padding="lg" className="flex items-center gap-5">
              <span className="relative grid shrink-0 place-items-center">
                <ProgressRing
                  value={progress.done}
                  max={progress.total}
                  tone="hero"
                  className="size-20"
                />
                <span
                  aria-hidden="true"
                  className="absolute font-bold text-lg tabular-nums"
                >
                  <span dir="ltr">
                    {progress.done}/{progress.total}
                  </span>
                </span>
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="font-bold text-xl">
                  {t("card.progress", {
                    done: progress.done,
                    total: progress.total,
                  })}
                </span>
                <span className="text-base">
                  {list.status === "open" ? leftWords : words.readOnly}
                </span>
                {words.due ? (
                  // Near or late, a clock says so beside the words, which
                  // carry it; warning colours don't read on the accent.
                  <span className="mt-1 inline-flex min-h-[30px] w-fit items-center gap-1.5 rounded-full bg-accent-press px-3 font-semibold text-sm shadow-[inset_0_0.5px_0_var(--glass-sheen)]">
                    {words.due.tone === "warning" ? (
                      <AlarmClock
                        aria-hidden="true"
                        className="size-4 shrink-0"
                      />
                    ) : null}
                    <span>{words.due.label}</span>
                  </span>
                ) : null}
              </span>
            </Card>
          </section>

          {list.note ? (
            <Card tone="flat" padding="lg" className="whitespace-pre-line">
              <span className="sr-only">{tl("note")}: </span>
              {list.note}
            </Card>
          ) : null}

          {words.readOnly && list.status === "open" ? (
            <p className="px-1 text-ink-2">{words.readOnly}</p>
          ) : null}

          <PageSection title={tl("items")}>
            <ListGroup>
              {items.map((item) => {
                const range = rangeOf(item);
                const out = isOutOfRange(item);
                const minusOf = needsMinus(item)
                  ? {
                      label: tl("minus"),
                      on: minus[item.id] ?? false,
                      onToggle: () => toggleMinus(item),
                    }
                  : null;
                return (
                  <ChecklistItem
                    key={item.id}
                    kind={item.kind}
                    label={item.label}
                    hint={hintOf(item)}
                    required={item.required}
                    optionalLabel={tl("optional")}
                    done={item.done}
                    doneLine={doneLine(item)}
                    comment={item.comment}
                    readOnly={!fill}
                    commentAction={
                      fill && item.kind !== "note"
                        ? {
                            label: item.comment
                              ? tl("comment.edit")
                              : tl("comment.add"),
                            onClick: () => openComment(item),
                          }
                        : null
                    }
                    check={
                      item.kind === "check"
                        ? {
                            checked: item.done,
                            onToggle: () =>
                              void save(item, { checked: !item.done }),
                          }
                        : undefined
                    }
                    quantity={quantityOf(item)}
                    number={
                      item.kind === "number"
                        ? {
                            // Read-only, the minus toggle isn't there to say
                            // the sign, so the reading carries its own.
                            value: fill
                              ? (drafts[item.id] ?? "")
                              : typed(item.reading, false),
                            onValueChange: (value) =>
                              setDrafts((current) => ({
                                ...current,
                                [item.id]: value,
                              })),
                            onCommit: () => commitNumber(item),
                            fieldLabel: tl("readingOf", { label: item.label }),
                            unit: item.unit,
                            range: range
                              ? t.rich(`list.range.${range.kind}`, {
                                  range: range.range,
                                  ltr,
                                })
                              : null,
                            outOfRange:
                              out && range
                                ? t.rich("list.outOfRange", {
                                    range: range.range,
                                    ltr,
                                  })
                                : null,
                            minus: fill ? minusOf : null,
                          }
                        : undefined
                    }
                    note={
                      item.kind === "note"
                        ? {
                            value: drafts[item.id] ?? "",
                            onValueChange: (value) =>
                              setDrafts((current) => ({
                                ...current,
                                [item.id]: value,
                              })),
                            onCommit: () => commitNote(item),
                            fieldLabel: item.label,
                            placeholder: tl("answerPlaceholder"),
                          }
                        : undefined
                    }
                    photo={item.kind === "photo" ? photoOf(item) : undefined}
                  />
                );
              })}
            </ListGroup>
          </PageSection>

          {/* Second to finishing it: passing it to another department (L5). */}
          {data.pass ? (
            <div className="flex flex-col items-start gap-1">
              <Button
                variant="secondary"
                size="lg"
                className="w-full md:w-auto"
                // Not while a photo is on its way: once passed, the list
                // may no longer be theirs to save it on.
                disabled={finishing || passing || photosBusy}
                onClick={openPass}
              >
                <ArrowLeftRight aria-hidden="true" />
                {tl("pass.action")}
              </Button>
            </div>
          ) : null}

          {/* Desktop: the readings at a glance, out of range flagged. */}
          {numbers.length > 0 ? (
            <PageSection
              title={tl("readings.title")}
              className="hidden xl:flex"
            >
              <div className="overflow-hidden rounded-card bg-surface shadow-card">
                <table className="w-full border-collapse text-base">
                  <caption className="sr-only">{tl("readings.title")}</caption>
                  <thead>
                    <tr>
                      <th
                        scope="col"
                        className="px-4 py-3 text-start font-medium text-ink-2 text-sm"
                      >
                        {tl("readings.item")}
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-3 text-start font-medium text-ink-2 text-sm"
                      >
                        {tl("readings.reading")}
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-3 text-start font-medium text-ink-2 text-sm"
                      >
                        {tl("readings.range")}
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-3 text-start font-medium text-ink-2 text-sm"
                      >
                        {tl("readings.who")}
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-3 text-start font-medium text-ink-2 text-sm"
                      >
                        {tl("readings.when")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {numbers.map((item) => {
                      const range = rangeOf(item);
                      // Who read it and when: whoever saved it last.
                      const readAt = item.reading !== null ? item.doneAt : null;
                      return (
                        <tr key={item.id}>
                          <td className="border-line border-t px-4 py-3">
                            {item.label}
                          </td>
                          <td className="border-line border-t px-4 py-3">
                            {item.reading === null ? (
                              <span className="text-ink-2">—</span>
                            ) : isOutOfRange(item) ? (
                              <Badge tone="warning">
                                <span dir="ltr">
                                  {signed(item.reading)}
                                  {item.unit ? ` ${item.unit}` : ""}
                                </span>
                              </Badge>
                            ) : (
                              <span dir="ltr">
                                {signed(item.reading)}
                                {item.unit ? ` ${item.unit}` : ""}
                              </span>
                            )}
                          </td>
                          <td
                            className={cn(
                              "border-line border-t px-4 py-3 text-ink-2",
                            )}
                          >
                            {range ? <span dir="ltr">{range.range}</span> : "—"}
                          </td>
                          <td className="border-line border-t px-4 py-3 text-ink-2">
                            {readAt
                              ? (item.doneBy &&
                                  lookups.people[item.doneBy]?.name) ||
                                t("noName")
                              : "—"}
                          </td>
                          <td className="border-line border-t px-4 py-3 text-ink-2">
                            {readAt ? (
                              <span dir="ltr">
                                {timeIn(new Date(readAt), timeZone)}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </PageSection>
          ) : null}
        </div>

        <aside
          aria-label={tl("details.title")}
          className="flex min-w-0 flex-col gap-6"
        >
          <Card tone="flat" padding="lg" className="hidden md:block">
            <dl className="flex flex-col gap-3">
              {words.details.map((detail) => (
                <div key={detail.key} className="flex flex-col gap-0.5">
                  <dt className="text-ink-2 text-sm">{detail.label}</dt>
                  <dd className="text-base">{detail.value}</dd>
                </div>
              ))}
            </dl>
          </Card>

          {/* Phone: what happened, folded at the end. */}
          <details className="group md:hidden">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-full px-1 font-bold text-lg focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
              {tl("timeline.title")}
              <ChevronDown
                aria-hidden="true"
                className="size-5 text-ink-2 transition-transform duration-200 group-open:rotate-180"
              />
            </summary>
            <Card tone="flat" padding="lg" className="mt-3">
              {timeline}
            </Card>
          </details>
          <PageSection title={tl("timeline.title")} className="hidden md:flex">
            <Card tone="flat" padding="lg">
              {timeline}
            </Card>
          </PageSection>
        </aside>
      </div>

      {fill ? (
        <div className="xl:hidden">
          <div aria-hidden="true" className="h-36" />
          <FloatingDock
            notice={
              <p className="glass mx-auto w-fit rounded-[22px] px-4 py-2 text-center font-medium text-base">
                {leftWords}
              </p>
            }
          >
            <DockButton
              icon={<CheckCheck />}
              loading={finishing}
              disabled={progress.requiredLeft > 0 || photosBusy}
              onClick={finish}
            >
              {tl("finish")}
            </DockButton>
          </FloatingDock>
        </div>
      ) : null}

      <Sheet
        open={commentFor !== null}
        onOpenChange={(open) => {
          if (!open) setCommentFor(null);
        }}
        title={tl("comment.title")}
        subtitle={items.find((item) => item.id === commentFor)?.label}
        closeLabel={tl("comment.close")}
        action={{
          label: tl("comment.save"),
          onClick: () => void saveComment(),
        }}
      >
        <div className="px-2 pt-1 pb-2">
          <TextArea
            label={tl("comment.label")}
            value={commentDraft}
            maxLength={200}
            rows={3}
            onChange={(event) => setCommentDraft(event.target.value)}
          />
        </div>
      </Sheet>

      {data.pass ? (
        <Sheet
          open={passOpen}
          onOpenChange={setPassOpen}
          title={tl("pass.title")}
          subtitle={list.name}
          closeLabel={tl("pass.close")}
        >
          <div className="flex flex-col gap-4 px-2 pt-1 pb-2">
            <ChoiceList legend={tl("pass.to")}>
              {data.pass.targets.map((target) => (
                <ChoiceRow
                  key={target.id}
                  name="pass-to"
                  value={target.id}
                  checked={passTo === target.id}
                  // Nobody there to take it: said, and not taken.
                  disabled={target.people === 0}
                  onChange={() => {
                    setPassTo(target.id);
                    setPassFailure(null);
                  }}
                  title={target.name}
                  hint={tl("pass.people", { count: target.people })}
                  leading={<Building2 />}
                  className={cn(target.people === 0 && "cursor-default")}
                />
              ))}
            </ChoiceList>
            <TextArea
              label={tl("pass.note")}
              hint={tl("pass.noteHint")}
              value={passNote}
              maxLength={MAX_PASS_NOTE}
              rows={3}
              onChange={(event) => {
                setPassNote(event.target.value);
                setPassFailure(null);
              }}
            />
            {passFailure ? (
              <p role="alert" className="px-2 font-medium text-danger">
                {tl(`failed.${passFailure}`)}
              </p>
            ) : null}
            <Button
              size="lg"
              loading={passing}
              disabled={passTarget === null}
              onClick={pass}
            >
              <ArrowLeftRight aria-hidden="true" />
              {passTarget
                ? tl("pass.submit", { name: passTarget.name })
                : tl("pass.choose")}
            </Button>
          </div>
        </Sheet>
      ) : null}
    </PageBody>
  );
}
