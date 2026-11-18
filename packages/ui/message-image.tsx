"use client";

import { ImageOff, RotateCcw } from "lucide-react";
import Image from "next/image";
import { type ReactNode, useState } from "react";
import { cn } from "./cn";
import { Spinner } from "./spinner";

/** A message's picture (chat C4), as MessageBubble shows it. */
export type MessageImage =
  | {
      kind: "shown";
      /**
       * Its thumbnail (the app's own route, which checks the reader again),
       * or the picture's own preview while it is on its way.
       */
      src: string;
      /** What it is, for those who don't see it ("תמונה מנועה"). */
      alt: string;
      /** "פתיחת התמונה": the whole picture, in a sheet. */
      open: { label: string; onOpen: (trigger: HTMLElement) => void };
      /** On its way: dimmed, with a spinner over it. */
      busy?: boolean;
      /**
       * Said in its place when it can't be fetched (no connection, or gone
       * since), as the way to fetch it again ("אי אפשר להציג את התמונה כרגע.
       * לנסות שוב").
       */
      retry: string;
      /**
       * Heard after `alt` in the button's name, where pictures sit side by
       * side with nothing else to tell them apart (a conversation's details:
       * when it was sent).
       */
      detail?: ReactNode;
    }
  /** No longer kept (its days or the business's space took it); the message stays. */
  | { kind: "gone"; label: string };

/**
 * A message's picture: its thumbnail in a square of its own, so nothing
 * moves as it loads, cropped to fill it (the whole picture opens on a tap,
 * in a sheet), or the line saying its file is no longer kept. A thumbnail
 * that can't be fetched says so in its place, and a press there fetches it
 * again. Never the Next image optimizer: the file is private, read by its
 * readers alone. `size` sets the square's size: 224 px in a bubble, a grid's
 * cell elsewhere (a conversation's details).
 */
export function MessageImageView({
  image,
  size = "size-56 max-w-full",
}: {
  image: MessageImage;
  size?: string;
}) {
  if (image.kind === "gone") {
    return (
      <p className="flex items-center gap-1.5 text-ink-2">
        <ImageOff aria-hidden="true" className="size-4 shrink-0" />
        {image.label}
      </p>
    );
  }
  // A new address (the server's copy in place of the preview) loads anew.
  return <Thumbnail key={image.src} image={image} size={size} />;
}

function Thumbnail({
  image,
  size,
}: {
  image: Extract<MessageImage, { kind: "shown" }>;
  size: string;
}) {
  const [failed, setFailed] = useState(false);
  // One button either way, so a press to try again keeps the focus on it;
  // the picture, drawn anew, asks for its file again.
  return (
    <button
      type="button"
      aria-haspopup={failed ? undefined : "dialog"}
      title={failed ? undefined : image.open.label}
      onClick={(event) => {
        if (!failed) {
          image.open.onOpen(event.currentTarget);
          return;
        }
        setFailed(false);
      }}
      className={cn(
        "pressable relative grid min-h-11 shrink-0 place-items-center overflow-hidden rounded-control bg-surface-2",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        failed && "p-2 text-center text-ink-2 text-sm",
        size,
      )}
    >
      {failed ? (
        <span className="flex flex-col items-center gap-2">
          <RotateCcw aria-hidden="true" className="size-5" />
          {image.retry}
        </span>
      ) : (
        <Image
          src={image.src}
          alt={image.alt}
          fill
          unoptimized
          draggable={false}
          sizes="224px"
          onError={() => setFailed(true)}
          className={cn(
            "object-cover transition-opacity duration-200",
            image.busy && "opacity-60",
          )}
        />
      )}
      {image.detail ? <span className="sr-only">{image.detail}</span> : null}
      {image.busy && !failed ? (
        <span
          aria-hidden="true"
          className="absolute inset-0 grid place-items-center text-ink"
        >
          <span className="grid size-11 place-items-center rounded-full bg-surface shadow-card">
            <Spinner />
          </span>
        </span>
      ) : null}
    </button>
  );
}
