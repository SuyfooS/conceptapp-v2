"use client";

import type { PhotoFailure, PhotoSaveResult } from "@domain/profile-photos";
import { Camera, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { Avatar } from "./avatar";
import { Button } from "./button";
import { encodeProfilePhoto, PhotoReadError } from "./photo-encode";
import { Sheet } from "./sheet";
import { Spinner } from "./spinner";

export type { PhotoSaveResult };

/** What the picker can say went wrong, in `ui.photoPicker.failures`. */
type PickerFailure =
  | Exclude<PhotoFailure, "empty">
  | "unreadable"
  | "removeFailed";

const failureOf = (failure: PhotoFailure): PickerFailure =>
  failure === "empty" ? "unreadable" : failure;

export type AvatarPhotoPickerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  photo: string | null;
  /** Saves the re-encoded photo. */
  onSave: (photo: Blob) => Promise<PhotoSaveResult>;
  /** Removes it; `kept` is the photo's bytes, read first, for the undo. */
  onRemove: (kept: Blob) => Promise<PhotoSaveResult>;
};

type Stage =
  | { kind: "idle" }
  | { kind: "preparing" }
  | { kind: "preview"; blob: Blob; url: string };

/**
 * Choosing a profile photo, in a sheet: the phone's own picker (its photos or
 * the camera), then a preview of the round crop, then save. The photo is
 * re-encoded here first (`encodeProfilePhoto`), so what leaves the phone is a
 * small square with nothing from the camera inside. Removing reads the photo
 * first, so the screen can offer it back.
 */
export function AvatarPhotoPicker({
  open,
  onOpenChange,
  name,
  photo,
  onSave,
  onRemove,
}: AvatarPhotoPickerProps) {
  const t = useTranslations("ui.photoPicker");
  const input = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [failure, setFailure] = useState<PickerFailure | null>(null);
  const [busy, setBusy] = useState<"save" | "remove" | null>(null);
  const preview = stage.kind === "preview" ? stage.url : null;
  // Counts picks: one that finishes after the sheet closed, or after a newer
  // pick, is no longer wanted and changes nothing.
  const pick = useRef(0);

  // A preview's address lives as long as the preview.
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  function reset() {
    pick.current += 1;
    setStage({ kind: "idle" });
    setFailure(null);
    setBusy(null);
  }

  function change(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  async function picked(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // The same file can be picked again after an error.
    event.target.value = "";
    if (!file) return;
    pick.current += 1;
    const mine = pick.current;
    setFailure(null);
    setStage({ kind: "preparing" });
    try {
      const blob = await encodeProfilePhoto(file);
      if (pick.current !== mine) return;
      setStage({ kind: "preview", blob, url: URL.createObjectURL(blob) });
    } catch (error) {
      if (pick.current !== mine) return;
      setFailure(
        error instanceof PhotoReadError ? error.problem : "unreadable",
      );
      setStage({ kind: "idle" });
    }
  }

  async function save() {
    if (stage.kind !== "preview") return;
    setBusy("save");
    setFailure(null);
    const result = await onSave(stage.blob).catch(
      () => ({ ok: false, failure: "failed" }) as const,
    );
    if (result.ok) {
      change(false);
      return;
    }
    setBusy(null);
    setFailure(failureOf(result.failure));
  }

  async function remove() {
    if (!photo) return;
    setBusy("remove");
    setFailure(null);
    // The bytes first, from the same address the screen shows: without them
    // there would be nothing to bring back, so nothing is removed.
    let kept: Blob;
    try {
      const response = await fetch(photo);
      if (!response.ok) throw new Error(String(response.status));
      kept = await response.blob();
    } catch {
      setBusy(null);
      setFailure("removeFailed");
      return;
    }
    const result = await onRemove(kept).catch(
      () => ({ ok: false, failure: "failed" }) as const,
    );
    if (result.ok) {
      change(false);
      return;
    }
    setBusy(null);
    setFailure(
      result.failure === "failed" ? "removeFailed" : failureOf(result.failure),
    );
  }

  const choose = () => input.current?.click();

  return (
    <Sheet
      open={open}
      onOpenChange={change}
      title={t("title")}
      subtitle={t("subtitle")}
      closeLabel={t("close")}
    >
      <div className="flex flex-col items-center gap-5 px-2 pt-3 pb-1">
        <div className="relative grid size-40 place-items-center">
          {stage.kind === "preparing" ? (
            <span className="grid size-40 place-items-center rounded-full bg-surface-2 text-ink-2">
              <Spinner className="size-8" />
            </span>
          ) : (
            <Avatar
              name={name}
              photo={preview ?? photo}
              size="xl"
              className="size-40 shadow-float"
            />
          )}
        </div>

        <div aria-live="polite" className="min-h-6 text-center">
          {stage.kind === "preparing" ? (
            <p className="text-base text-ink-2">{t("preparing")}</p>
          ) : null}
        </div>
        {failure ? (
          <p role="alert" className="-mt-4 text-center text-base text-danger">
            {t(`failures.${failure}`)}
          </p>
        ) : null}

        <input
          ref={input}
          type="file"
          // Listing the types makes an iPhone hand over a JPEG, not HEIC; the
          // camera is still offered.
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={picked}
        />

        <div className="flex w-full flex-col gap-2">
          {stage.kind === "preview" ? (
            <>
              <Button
                size="lg"
                loading={busy === "save"}
                onClick={save}
                className="w-full"
              >
                {t("save")}
              </Button>
              <Button
                variant="ghost"
                disabled={busy !== null}
                onClick={choose}
                className="w-full"
              >
                {t("chooseOther")}
              </Button>
            </>
          ) : (
            <>
              <Button
                size="lg"
                disabled={stage.kind === "preparing" || busy !== null}
                onClick={choose}
                className="w-full"
              >
                <Camera aria-hidden="true" />
                {t("choose")}
              </Button>
              {photo ? (
                <Button
                  variant="ghost"
                  loading={busy === "remove"}
                  disabled={stage.kind === "preparing"}
                  onClick={remove}
                  className="w-full text-danger"
                >
                  {busy === "remove" ? null : <Trash2 aria-hidden="true" />}
                  {t("remove")}
                </Button>
              ) : null}
            </>
          )}
        </div>
        <p className="px-4 pb-1 text-balance text-center text-ink-2 text-sm">
          {t("note")}
        </p>
      </div>
    </Sheet>
  );
}
