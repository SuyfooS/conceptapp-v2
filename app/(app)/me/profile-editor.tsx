"use client";

import type { PhotoSaveResult } from "@domain/profile-photos";
import { Avatar } from "@ui/avatar";
import { AvatarPhotoPicker } from "@ui/avatar-photo-picker";
import { Button } from "@ui/button";
import { IconButton } from "@ui/icon-button";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { ProfileCover } from "@ui/profile-cover";
import { StatusToast } from "@ui/status-toast";
import { VisibilityNote } from "@ui/visibility-note";
import { Camera, ChevronRight, ImageIcon, LogOut } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { UndoRow } from "../manage/undo-row";

/** Why the person can't change their photo here, if they can't. */
export type PhotoLock = "demo" | "viewOnly" | "notYet";

/** The server actions the profile calls, or the demo's stand-ins. */
export type MeActions = {
  setPhoto: (form: FormData) => Promise<PhotoSaveResult>;
  removePhoto: () => Promise<PhotoSaveResult>;
};

const EXTENSIONS: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
};

function photoForm(photo: Blob): FormData {
  const form = new FormData();
  form.set("photo", photo, `photo.${EXTENSIONS[photo.type] ?? "jpg"}`);
  return form;
}

type Toast = { message: string; stamp: string };

/**
 * The profile screen as it changes: the cover, the photo with its camera
 * button, the name, the rows about the person and the way out. One render
 * that changes shape, so the photo sheet exists once. Phone: the cover runs
 * to the edges, the photo overlaps it, everything under it. Tablet and
 * desktop: an identity card that stays in view on the start side, the rows
 * on the end side. After a removal it keeps the photo's bytes and offers them
 * back until the next change, or until the person leaves.
 */
export function ProfileEditor({
  name,
  photo,
  subtitle,
  locked,
  home,
  actions,
  signOut,
  notifications,
}: {
  name: string;
  photo: string | null;
  /** "עובד/ת · בצוות מאז נובמבר 2026". */
  subtitle: string;
  locked: PhotoLock | null;
  /** Where "back" leads: Today, or the demo's. */
  home: string;
  actions: MeActions;
  signOut: () => Promise<void>;
  /** The switch for notifications on this phone, where there is one. */
  notifications?: ReactNode;
}) {
  const t = useTranslations("app");
  const tp = useTranslations("ui.photoPicker");
  const [open, setOpen] = useState(false);
  // What the screen shows now: the server's photo, until an answer says
  // otherwise, and again whenever the server sends a new one.
  const [shown, setShown] = useState(photo);
  const [seen, setSeen] = useState(photo);
  if (photo !== seen) {
    setSeen(photo);
    setShown(photo);
  }
  const [kept, setKept] = useState<Blob | null>(null);
  // The last undo didn't reach the server: the bytes are still here to retry.
  const [undoFailed, setUndoFailed] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [undoing, setUndoing] = useState(false);

  const say = (message: string) =>
    setToast({ message, stamp: Date.now().toString() });

  function keep(bytes: Blob | null) {
    setKept(bytes);
    setUndoFailed(false);
  }

  async function save(blob: Blob): Promise<PhotoSaveResult> {
    const result = await actions.setPhoto(photoForm(blob));
    if (result.ok) {
      setShown(result.photo);
      keep(null);
      say(tp("saved"));
    }
    return result;
  }

  async function remove(bytes: Blob): Promise<PhotoSaveResult> {
    const result = await actions.removePhoto();
    if (result.ok) {
      setShown(null);
      keep(bytes);
    }
    return result;
  }

  async function undo() {
    if (!kept || undoing) return;
    setUndoing(true);
    const result = await actions
      .setPhoto(photoForm(kept))
      .catch(() => ({ ok: false, failure: "failed" }) as const);
    setUndoing(false);
    if (result.ok) {
      setShown(result.photo);
      keep(null);
      say(tp("saved"));
    } else if (result.failure === "failed") {
      // It didn't get there: the row stays, saying so, and "ביטול" tries again.
      setUndoFailed(true);
    } else {
      // Refused for good: nothing left to try, so the row goes and says why.
      keep(null);
      say(t("me.photo.gone"));
    }
  }

  const lockedLine = locked ? t(`me.photo.${locked}`) : null;
  const cameraLabel = shown ? tp("change") : tp("add");

  return (
    <PageBody className="max-w-5xl">
      <div className="grid gap-6 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:items-start md:gap-8 xl:grid-cols-[minmax(0,4fr)_minmax(0,6fr)]">
        {/* Who: the cover, the photo over it, the name and the line. */}
        <section
          aria-label={name}
          className="min-w-0 md:sticky md:top-8 md:overflow-hidden md:rounded-card md:bg-surface md:pb-5 md:shadow-card"
        >
          <ProfileCover className="-mx-4 -mt-[calc(env(safe-area-inset-top)+1.25rem)] h-[calc(env(safe-area-inset-top)+150px)] rounded-b-sheet md:mx-0 md:mt-0 md:h-[140px] md:rounded-none xl:h-40">
            <Link
              href={home}
              className="pressable absolute start-3 top-[calc(env(safe-area-inset-top)+0.75rem)] flex min-h-11 items-center gap-0.5 rounded-full bg-accent-press ps-2 pe-4 font-semibold text-accent-ink text-base focus-visible:outline-2 focus-visible:outline-accent-ink md:top-3"
            >
              <ChevronRight
                aria-hidden="true"
                className="size-5 ltr:-scale-x-100"
              />
              {t("nav.home")}
            </Link>
          </ProfileCover>
          <div className="relative -mt-12 ps-1 md:px-5">
            <div className="relative size-24">
              <Avatar
                name={name}
                photo={shown}
                size="xl"
                className="shadow-[0_0_0_4px_var(--bg),var(--float-shadow)] md:shadow-[0_0_0_4px_var(--surface),var(--float-shadow)]"
              />
              {locked ? null : (
                <IconButton
                  label={cameraLabel}
                  aria-haspopup="dialog"
                  onClick={() => setOpen(true)}
                  className="absolute -end-2.5 -bottom-1.5 hover:bg-transparent active:bg-transparent"
                  icon={
                    <span className="grid size-[34px] place-items-center rounded-full bg-surface text-ink shadow-[0_0_0_3px_var(--bg),var(--card-shadow)] md:shadow-[0_0_0_3px_var(--surface),var(--card-shadow)]">
                      <Camera aria-hidden="true" />
                    </span>
                  }
                />
              )}
            </div>
            <div className="mt-3">
              <PageHeader title={name} subtitle={subtitle} />
            </div>
          </div>
          {kept ? (
            <div className="mt-4 md:px-5">
              <UndoRow
                message={t(
                  undoFailed ? "me.photo.undoFailed" : "me.photo.removed",
                )}
                onUndo={undo}
                pending={undoing}
              />
            </div>
          ) : null}
        </section>

        <div className="flex min-w-0 flex-col gap-6">
          <PageSection title={t("me.about.title")}>
            <VisibilityNote className="-mt-1 px-1">
              {t("me.about.visible")}
            </VisibilityNote>
            <ListGroup>
              {locked ? (
                <ListRow
                  leading={<ImageIcon />}
                  title={t("me.photo.row")}
                  subtitle={lockedLine}
                  trailing={<Avatar name={name} photo={shown} size="sm" />}
                />
              ) : (
                <ListRow
                  leading={<ImageIcon />}
                  title={t("me.photo.row")}
                  subtitle={t("me.photo.rowHint")}
                  trailing={<Avatar name={name} photo={shown} size="sm" />}
                  onClick={() => setOpen(true)}
                />
              )}
            </ListGroup>
          </PageSection>

          {notifications}

          <form
            action={signOut}
            className="flex justify-center md:justify-start"
          >
            <Button type="submit" variant="ghost" className="text-ink-2">
              <LogOut aria-hidden="true" className="rtl:-scale-x-100" />
              {t("signOut")}
            </Button>
          </form>
        </div>
      </div>

      {locked ? null : (
        <AvatarPhotoPicker
          open={open}
          onOpenChange={setOpen}
          name={name}
          photo={shown}
          onSave={save}
          onRemove={remove}
        />
      )}
      <StatusToast message={toast?.message ?? null} stamp={toast?.stamp} />
    </PageBody>
  );
}
