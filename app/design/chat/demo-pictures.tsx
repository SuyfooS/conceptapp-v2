"use client";

import { MessageImageView } from "@ui/message-image";
import { PhotoSheet } from "@ui/photo-sheet";
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";

export type DemoPicture = {
  id: string;
  src: string;
  alt: string;
  caption: string | null;
  /** "07:41". */
  time: string;
};

/**
 * A conversation's latest pictures in the demo's details (C4), as the app's
 * ChatPicturesGrid shows them: each opens the whole of it in a sheet, and is
 * named with when it was sent.
 */
export function DemoPictures({ pictures }: { pictures: DemoPicture[] }) {
  const t = useTranslations("app.chat");
  const [opened, setOpened] = useState<DemoPicture | null>(null);
  const [open, setOpen] = useState(false);
  const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;
  return (
    <>
      <ul className="grid grid-cols-3 gap-2">
        {pictures.map((picture) => (
          <li key={picture.id} className="min-w-0">
            <MessageImageView
              size="aspect-square w-full"
              image={{
                kind: "shown",
                src: picture.src,
                alt: picture.alt,
                detail: t.rich("image.sent", { time: picture.time, ltr }),
                retry: t("image.retry"),
                open: {
                  label: t("image.open"),
                  onOpen: () => {
                    setOpened(picture);
                    setOpen(true);
                  },
                },
              }}
            />
          </li>
        ))}
      </ul>
      <PhotoSheet
        open={open}
        onOpenChange={setOpen}
        photo={opened}
        subtitle={
          opened ? t.rich("image.when", { time: opened.time, ltr }) : undefined
        }
        closeLabel={t("image.close")}
        loadingLabel={t("image.loading")}
        unavailable={t("image.unavailable")}
      />
    </>
  );
}
