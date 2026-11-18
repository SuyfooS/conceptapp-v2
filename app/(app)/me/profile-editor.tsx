"use client";

import { avatarHue, firstNameOf } from "@domain/people";
import {
  type AddressForm,
  type CoverPreset,
  normalizeBio,
  type ProfileChange,
  type ProfileSaveResult,
} from "@domain/profile";
import type { PhotoSaveResult } from "@domain/profile-photos";
import { Avatar } from "@ui/avatar";
import { AvatarPhotoPicker } from "@ui/avatar-photo-picker";
import { Button } from "@ui/button";
import { IconButton } from "@ui/icon-button";
import { ListGroup, ListRow, type ListRowProps } from "@ui/list-row";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { ProfileCover } from "@ui/profile-cover";
import { StatusToast } from "@ui/status-toast";
import { VisibilityNote } from "@ui/visibility-note";
import {
  Camera,
  ImageIcon,
  LogOut,
  Palette,
  PenLine,
  Speech,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { type SignOutAction, SignOutForm } from "@/app/sign-out-form";
import { UndoRow } from "../manage/undo-row";
import {
  BioSheet,
  CoverSheet,
  FormSheet,
  failureKey,
  settle,
  WhyDetails,
} from "./about-sheets";
import { ProfileFrame, profileAvatarRing } from "./profile-frame";

/** Why the person can't change their photo here, if they can't. */
export type PhotoLock = "demo" | "viewOnly" | "notYet";

/** Why none of the rows about the person can change here, if they can't. */
export type AboutLock = "viewOnly" | "notYet";

/** What the person's colleagues read about them besides the photo. */
export type MeAbout = {
  bio: string | null;
  cover: CoverPreset;
  addressForm: AddressForm | null;
  locked: AboutLock | null;
  /** In a demo business that keeps its people: a cover and a form, no line. */
  demo: boolean;
};

/** The server actions the profile calls, or the demo's stand-ins. */
export type MeActions = {
  setPhoto: (form: FormData) => Promise<PhotoSaveResult>;
  removePhoto: () => Promise<PhotoSaveResult>;
  saveProfile: (change: ProfileChange) => Promise<ProfileSaveResult>;
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

/**
 * What the server sends, which an answer may change on the spot until the
 * server sends something new.
 */
function useServerValue<T>(server: T): [T, (next: T) => void] {
  const [shown, setShown] = useState(server);
  const [seen, setSeen] = useState(server);
  if (!Object.is(server, seen)) {
    setSeen(server);
    setShown(server);
  }
  return [shown, setShown];
}

/** A row of "עליי": it opens its sheet, or says why it can't. */
function AboutRow({
  onOpen,
  ...row
}: Pick<ListRowProps, "title" | "subtitle" | "leading" | "trailing"> & {
  onOpen: (() => void) | null;
}) {
  return onOpen ? <ListRow {...row} onClick={onOpen} /> : <ListRow {...row} />;
}

type Toast = { message: string; stamp: string };
type Open = "photo" | "bio" | "cover" | "form" | null;
/** What was just removed, kept to bring back until the next change. */
type Undo =
  | { kind: "photo"; bytes: Blob; failed: boolean }
  | { kind: "bio"; text: string; failed: boolean };

/**
 * The profile screen as it changes: the cover, the photo with its camera
 * button, the name, the line about the person, the rows about them and the
 * way out. One render that changes shape, so each sheet exists once (the
 * shape is ProfileFrame's). After a removal, of the photo or the line, it
 * keeps what was removed and offers it back until the next change, or until
 * the person leaves.
 */
export function ProfileEditor({
  name,
  photo,
  subtitle,
  locked,
  about,
  businessName,
  home,
  actions,
  signOut,
  notifications,
  businesses,
  documents,
}: {
  name: string;
  photo: string | null;
  /** "עובד/ת · בצוות מאז נובמבר 2026". */
  subtitle: string;
  locked: PhotoLock | null;
  about: MeAbout;
  /** Whose colour the covers are drawn in. */
  businessName: string;
  /** Where "back" leads: Today, or the demo's. */
  home: string;
  actions: MeActions;
  signOut: SignOutAction;
  /** The way to the notification settings, where there is one. */
  notifications?: ReactNode;
  /** The switch between businesses, for someone in more than one. */
  businesses?: ReactNode;
  /** "המסמכים שלי" (chat C7), where documents are the person's. */
  documents?: ReactNode;
}) {
  const t = useTranslations("app");
  const tp = useTranslations("ui.photoPicker");
  const tc = useTranslations("ui.profileCover");
  const [open, setOpen] = useState<Open>(null);
  const [shown, setShown] = useServerValue(photo);
  const [bio, setBio] = useServerValue(about.bio);
  const [cover, setCover] = useServerValue(about.cover);
  const [form, setForm] = useServerValue(about.addressForm);
  // The cover picked in its sheet, shown on the page before it is saved.
  const [coverDraft, setCoverDraft] = useState<CoverPreset | null>(null);
  const [undo, setUndo] = useState<Undo | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const hue = avatarHue(name);

  const say = (message: string) =>
    setToast({ message, stamp: Date.now().toString() });
  const sheet = (which: Exclude<Open, null>) => (next: boolean) => {
    setOpen(next ? which : null);
    if (which === "cover") setCoverDraft(next ? cover : null);
  };

  // The photo ------------------------------------------------------------
  async function savePhoto(blob: Blob): Promise<PhotoSaveResult> {
    const result = await actions.setPhoto(photoForm(blob));
    if (result.ok) {
      setShown(result.photo);
      setUndo(null);
      say(tp("saved"));
    }
    return result;
  }

  async function removePhoto(bytes: Blob): Promise<PhotoSaveResult> {
    const result = await actions.removePhoto();
    if (result.ok) {
      setShown(null);
      setUndo({ kind: "photo", bytes, failed: false });
    }
    return result;
  }

  // The line, the cover and the form of address --------------------------
  const save = (change: ProfileChange) => settle(actions.saveProfile(change));

  async function saveBio(text: string): Promise<ProfileSaveResult> {
    const result = await save({ bio: text });
    if (result.ok) {
      setBio(normalizeBio(text) || null);
      setUndo(null);
      say(t("me.bio.saved"));
    }
    return result;
  }

  async function removeBio(): Promise<ProfileSaveResult> {
    const old = bio;
    const result = await save({ bio: null });
    if (result.ok) {
      setBio(null);
      setUndo(old ? { kind: "bio", text: old, failed: false } : null);
    }
    return result;
  }

  async function saveCover(preset: CoverPreset): Promise<ProfileSaveResult> {
    const result = await save({ cover: preset });
    if (result.ok) {
      setCover(preset);
      say(t("me.cover.saved"));
    }
    return result;
  }

  async function saveForm(next: AddressForm): Promise<ProfileSaveResult> {
    const result = await save({ addressForm: next });
    if (result.ok) {
      setForm(next);
      say(t("me.form.saved"));
    }
    return result;
  }

  async function bringBack() {
    if (!undo || undoing) return;
    setUndoing(true);
    if (undo.kind === "photo") {
      const result = await actions
        .setPhoto(photoForm(undo.bytes))
        .catch(() => ({ ok: false, failure: "failed" }) as const);
      setUndoing(false);
      if (result.ok) {
        setShown(result.photo);
        setUndo(null);
        say(tp("saved"));
      } else if (result.failure === "failed") {
        // It didn't get there: the row stays, saying so, and "ביטול" tries again.
        setUndo({ ...undo, failed: true });
      } else {
        // Refused for good: nothing left to try, so the row goes and says why.
        setUndo(null);
        say(t("me.photo.gone"));
      }
      return;
    }
    const result = await save({ bio: undo.text });
    setUndoing(false);
    if (result.ok) {
      setBio(undo.text);
      setUndo(null);
      say(t("me.bio.saved"));
    } else if (result.failure === "failed") {
      setUndo({ ...undo, failed: true });
    } else {
      setUndo(null);
      say(t(`me.failures.${failureKey(result.failure)}`));
    }
  }

  const undoMessage = !undo
    ? null
    : undo.kind === "photo"
      ? t(undo.failed ? "me.photo.undoFailed" : "me.photo.removed")
      : t(undo.failed ? "me.bio.undoFailed" : "me.bio.removed");

  // What can change here ------------------------------------------------
  const photoLine = locked ? t(`me.photo.${locked}`) : null;
  const cameraLabel = shown ? tp("change") : tp("add");
  const aboutLine = about.locked ? t(`me.${about.locked}`) : null;
  const canWriteBio = !about.locked && !about.demo;
  const canChoose = !about.locked;
  const shownCover = coverDraft ?? cover;
  const coverName = tc(`presets.${cover}`);

  return (
    <PageBody className="max-w-5xl">
      <ProfileFrame
        label={name}
        cover={shownCover}
        hue={hue}
        back={{ href: home, label: t("nav.home") }}
        avatar={
          <>
            <Avatar
              name={name}
              photo={shown}
              size="xl"
              className={profileAvatarRing}
            />
            {locked ? null : (
              <IconButton
                label={cameraLabel}
                aria-haspopup="dialog"
                onClick={() => setOpen("photo")}
                className="absolute -end-2.5 -bottom-1.5 hover:bg-transparent active:bg-transparent"
                icon={
                  <span className="grid size-[34px] place-items-center rounded-full bg-surface text-ink shadow-[0_0_0_3px_var(--bg),var(--card-shadow)] md:shadow-[0_0_0_3px_var(--surface),var(--card-shadow)]">
                    <Camera aria-hidden="true" />
                  </span>
                }
              />
            )}
          </>
        }
        identity={
          <>
            <PageHeader title={name} subtitle={subtitle} />
            {bio ? (
              <p className="-mt-1 text-pretty text-md">{bio}</p>
            ) : canWriteBio ? (
              <button
                type="button"
                aria-haspopup="dialog"
                onClick={() => setOpen("bio")}
                className="pressable -mt-2 flex min-h-11 items-center self-start rounded-full text-start text-ink-2 text-md focus-visible:outline-2 focus-visible:outline-accent"
              >
                {t("me.bio.empty")}
              </button>
            ) : null}
            {undo && undoMessage ? (
              <div className="mt-1">
                <UndoRow
                  message={undoMessage}
                  onUndo={bringBack}
                  pending={undoing}
                />
              </div>
            ) : null}
          </>
        }
      >
        <PageSection title={t("me.about.title")}>
          <div className="-mt-1 flex flex-col gap-1 px-1">
            <VisibilityNote>{t("me.about.visible")}</VisibilityNote>
            <WhyDetails summary={t("me.about.why")}>
              {t("me.about.notice")}
            </WhyDetails>
          </div>
          <ListGroup>
            <AboutRow
              leading={<ImageIcon />}
              title={t("me.photo.row")}
              subtitle={photoLine ?? t("me.photo.rowHint")}
              trailing={<Avatar name={name} photo={shown} size="sm" />}
              onOpen={locked ? null : () => setOpen("photo")}
            />
            <AboutRow
              leading={<PenLine />}
              title={t("me.bio.row")}
              subtitle={
                aboutLine ??
                (about.demo ? t("me.bio.demo") : t("me.bio.rowHint"))
              }
              onOpen={canWriteBio ? () => setOpen("bio") : null}
            />
            <AboutRow
              leading={<Palette />}
              title={t("me.cover.row")}
              subtitle={
                aboutLine ??
                t("me.cover.rowHint", {
                  cover: coverName,
                  business: businessName,
                })
              }
              trailing={
                <ProfileCover
                  preset={cover}
                  hue={hue}
                  className="h-[30px] w-12 rounded-control"
                />
              }
              onOpen={canChoose ? () => sheet("cover")(true) : null}
            />
            <AboutRow
              leading={<Speech />}
              title={t("me.form.row")}
              subtitle={aboutLine ?? t("me.form.rowHint")}
              trailing={
                <span className="text-base text-ink-2">
                  {/* The stored form, not formArg: "not chosen" is an answer here. */}
                  {t("me.form.value", { form: form ?? "none" })}
                </span>
              }
              onOpen={canChoose ? () => setOpen("form") : null}
            />
          </ListGroup>
        </PageSection>

        {documents}

        {businesses}

        {notifications}

        <SignOutForm
          action={signOut}
          className="flex justify-center md:justify-start"
        >
          <Button type="submit" variant="ghost" className="text-ink-2">
            <LogOut aria-hidden="true" className="rtl:-scale-x-100" />
            {t("signOut")}
          </Button>
        </SignOutForm>
      </ProfileFrame>

      {locked ? null : (
        <AvatarPhotoPicker
          open={open === "photo"}
          onOpenChange={sheet("photo")}
          name={name}
          photo={shown}
          onSave={savePhoto}
          onRemove={removePhoto}
        />
      )}
      {canWriteBio ? (
        <BioSheet
          open={open === "bio"}
          onOpenChange={sheet("bio")}
          bio={bio}
          onSave={saveBio}
          onRemove={removeBio}
        />
      ) : null}
      {canChoose ? (
        <>
          <CoverSheet
            open={open === "cover"}
            onOpenChange={sheet("cover")}
            business={businessName}
            hue={hue}
            draft={coverDraft}
            onDraft={setCoverDraft}
            onSave={saveCover}
          />
          <FormSheet
            open={open === "form"}
            onOpenChange={sheet("form")}
            form={form}
            firstName={firstNameOf(name)}
            onSave={saveForm}
          />
        </>
      ) : null}
      <StatusToast message={toast?.message ?? null} stamp={toast?.stamp} />
    </PageBody>
  );
}
