"use client";

import { FileField, type FileFieldChoice } from "@ui/file-field";
import { PICKED_PHOTO_ACCEPT } from "@ui/photo-encode";
import { Camera, FileText, ImageIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";

const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

/**
 * The gallery's file field (chat C7): empty with its three ways to pick a
 * file, with a photo of a page made ready (the demo's own sample), and with
 * a PDF on its way up. A file picked here is only shown, never sent.
 */
export function GalleryFileField() {
  const t = useTranslations("design");
  const ts = useTranslations("app.chat.documents.send");
  const [picked, setPicked] = useState<string | null>(null);
  const choices: FileFieldChoice[] = [
    {
      key: "camera",
      icon: <Camera />,
      label: ts("camera"),
      accept: "image/*",
      capture: "environment",
      onPick: (file) => setPicked(URL.createObjectURL(file)),
    },
    {
      key: "photos",
      icon: <ImageIcon />,
      label: ts("photos"),
      accept: PICKED_PHOTO_ACCEPT,
      onPick: (file) => setPicked(URL.createObjectURL(file)),
    },
    {
      key: "pdf",
      icon: <FileText />,
      label: ts("pdf"),
      accept: "application/pdf,.pdf",
      onPick: () => setPicked(null),
    },
  ];
  return (
    <div className="flex flex-col gap-6">
      <p className="text-ink-2 text-sm">{t("fileFieldText")}</p>
      <FileField
        legend={ts("file")}
        hint={ts.rich("fileHint", { max: 10, ltr })}
        chosenLabel={ts("chosen")}
        choices={choices}
        chosen={
          picked ? { kind: "image", src: picked, alt: ts("chosen") } : null
        }
        remove={{ label: ts("removeChosen"), onRemove: () => setPicked(null) }}
      />
      <FileField
        legend={t("fileFieldPhoto")}
        chosenLabel={ts("chosen")}
        choices={choices}
        chosen={{
          kind: "image",
          src: "/demo-documents/sick-note.webp",
          alt: ts("chosen"),
        }}
        remove={{ label: ts("removeChosen"), onRemove: () => {} }}
      />
      <FileField
        legend={t("fileFieldPdf")}
        chosenLabel={ts("chosen")}
        choices={choices}
        chosen={{
          kind: "pdf",
          name: t("fileFieldPdfName"),
          meta: <span dir="ltr">64 KB · PDF</span>,
        }}
        progress={{
          value: 0.45,
          label: ts("uploadLabel"),
          text: ts.rich("uploading", { percent: 45, ltr }),
        }}
        cancel={{ label: ts("stop"), onCancel: () => {} }}
      />
    </div>
  );
}
