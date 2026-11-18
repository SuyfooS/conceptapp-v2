"use client";

import { ImageOff } from "lucide-react";
import Image from "next/image";
import { type ReactNode, useState } from "react";
import { MessageText } from "./message-bubble";
import { Sheet } from "./sheet";
import { Spinner } from "./spinner";

export type PhotoSheetPhoto = {
  /** The whole picture (the app's own route, or a preview while it goes). */
  src: string;
  /** What it is, for those who don't see it; also the sheet's title. */
  alt: string;
  /** What was written with it, if anything. */
  caption?: string | null;
};

export type PhotoSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Kept while the sheet closes, so it doesn't empty as it goes. */
  photo: PhotoSheetPhoto | null;
  /** Who sent it and when ("נועה · 08:05"). */
  subtitle?: ReactNode;
  closeLabel: string;
  /** Said while it loads ("טוענים את התמונה"). */
  loadingLabel: string;
  /** Said in its place when it can't be fetched. */
  unavailable: string;
  returnFocus?: () => HTMLElement | null | undefined;
};

/**
 * A picture opened from a message (chat C4): the whole of it, as large as the
 * sheet allows and never cropped, in a place of its own size so nothing
 * moves as it loads, with what was written with it under it. Closing is the
 * sheet's: its button, the scrim, Escape or a drag down. Never the Next image
 * optimizer: the file is private, read by its readers alone.
 */
export function PhotoSheet({
  open,
  onOpenChange,
  photo,
  subtitle,
  closeLabel,
  loadingLabel,
  unavailable,
  returnFocus,
}: PhotoSheetProps) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={photo?.alt ?? ""}
      subtitle={subtitle}
      closeLabel={closeLabel}
      readingLabel={photo?.alt ?? closeLabel}
      returnFocus={returnFocus}
    >
      {photo ? (
        <div className="flex flex-col gap-3 px-2 pb-2">
          <Picture
            key={photo.src}
            photo={photo}
            loadingLabel={loadingLabel}
            unavailable={unavailable}
          />
          {photo.caption ? (
            <MessageText
              body={photo.caption}
              className="rounded-card bg-elevated px-4 py-3 text-ink"
            />
          ) : null}
        </div>
      ) : null}
    </Sheet>
  );
}

function Picture({
  photo,
  loadingLabel,
  unavailable,
}: {
  photo: PhotoSheetPhoto;
  loadingLabel: string;
  unavailable: string;
}) {
  const [state, setState] = useState<"loading" | "shown" | "failed">("loading");
  return (
    <div className="relative grid h-[min(60dvh,34rem)] w-full place-items-center overflow-hidden rounded-card bg-elevated">
      {state === "failed" ? (
        <p className="flex flex-col items-center gap-2 p-6 text-center text-ink-2">
          <ImageOff aria-hidden="true" className="size-6" />
          {unavailable}
        </p>
      ) : (
        <>
          <Image
            src={photo.src}
            alt={photo.alt}
            fill
            unoptimized
            draggable={false}
            sizes="(min-width: 576px) 544px, 100vw"
            onLoad={() => setState("shown")}
            onError={() => setState("failed")}
            className="object-contain"
          />
          {state === "loading" ? (
            <span className="relative flex items-center gap-2 text-ink-2">
              <Spinner className="size-4" />
              {loadingLabel}
            </span>
          ) : null}
        </>
      )}
    </div>
  );
}
