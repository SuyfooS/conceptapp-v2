"use client";

import { megabytes } from "@domain/storage-use";
import { Card, CardText, CardTitle } from "@ui/card";
import { cn } from "@ui/cn";
import { HardDrive } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode, Ref } from "react";
import type { DocumentSpace } from "./document-screen-types";

const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

/**
 * The business's space for documents filling up, or full (bigger teams, the
 * first fixes), for the office and whoever sends documents, before they try:
 * how much is taken, that documents are never deleted for space, and that
 * only the ConceptApp team gives more. A flat card, the same one in every
 * shape: the keep-a-copy notice is the documents' one accent card. Nothing
 * when the space has room (`space` null). With `headingRef`, its title takes
 * the keyboard's focus (the office's, once the notice above it is put away).
 */
export function DocumentSpaceNote({
  space,
  headingRef,
}: {
  space: DocumentSpace | null;
  /** Its title: where the focus goes once the notice above is put away. */
  headingRef?: Ref<HTMLHeadingElement>;
}) {
  const t = useTranslations("app.chat.documents.space");
  if (!space) return null;
  const full = space.state === "full";
  const amounts = {
    used: megabytes(space.usedBytes),
    space: megabytes(space.spaceBytes),
    ltr,
  };
  return (
    <Card padding="lg" className="flex items-start gap-3 md:max-w-2xl">
      <span
        aria-hidden="true"
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-full [&_svg]:size-5",
          full ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning",
        )}
      >
        <HardDrive />
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <CardTitle
          as="h2"
          ref={headingRef}
          tabIndex={headingRef ? -1 : undefined}
          className="outline-none"
        >
          {full ? t("full.title") : t("near.title")}
        </CardTitle>
        <CardText className="text-pretty">
          {full ? t.rich("full.body", amounts) : t.rich("near.body", amounts)}
        </CardText>
      </span>
    </Card>
  );
}
