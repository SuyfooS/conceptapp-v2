"use client";

import { Button } from "@ui/button";
import { Card, CardText, CardTitle } from "@ui/card";
import { ShareSheet } from "@ui/share-sheet";
import { VisibilityNote } from "@ui/visibility-note";
import { FolderLock, Send } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";

/** What the card says and offers, every word built on the server. */
export type FileCardWords = {
  title: string;
  lines: string[];
  /** Who sees the details themselves: for a reader who doesn't. */
  note: string | null;
  /** "שליחת קישור להשלמה": a message to /me/file that names nothing missing. */
  share: { label: string; title: string; message: string } | null;
  /** "פתיחת התיק", for a holder: the main action when there is nothing to send. */
  open: { href: string; label: string } | null;
};

/**
 * Someone's hiring file on their profile while anything in it needs action
 * (profile H6a): the page's one accent card, saying what is missing (to a
 * holder) or how much (to anyone else who sees the team), with its main
 * action, "שליחת קישור להשלמה", a share sheet whose message only asks them
 * to complete their file, and for a holder "פתיחת התיק" beside it. The
 * focus goes back to the button once the sheet closes.
 */
export function FileCard({ words }: { words: FileCardWords }) {
  const [sharing, setSharing] = useState(false);
  const shareButton = useRef<HTMLButtonElement>(null);
  const { share, open } = words;
  return (
    <Card tone="accent" padding="lg" className="flex flex-col gap-3">
      <CardTitle as="h2">{words.title}</CardTitle>
      {words.lines.map((line) => (
        <CardText key={line} className="text-ink">
          {line}
        </CardText>
      ))}
      {words.note ? (
        <VisibilityNote icon="lock">{words.note}</VisibilityNote>
      ) : null}
      {share || open ? (
        <div className="flex flex-col gap-2 md:flex-row md:flex-wrap">
          {share ? (
            <Button
              ref={shareButton}
              size="lg"
              onClick={() => setSharing(true)}
            >
              <Send aria-hidden="true" />
              {share.label}
            </Button>
          ) : null}
          {open ? (
            <Button asChild size="lg" variant={share ? "secondary" : "primary"}>
              <Link href={open.href}>
                <FolderLock aria-hidden="true" />
                {open.label}
              </Link>
            </Button>
          ) : null}
        </div>
      ) : null}
      {share ? (
        <ShareSheet
          open={sharing}
          onOpenChange={setSharing}
          title={share.title}
          message={share.message}
          path="/me/file"
          returnFocus={() => shareButton.current}
        />
      ) : null}
    </Card>
  );
}
