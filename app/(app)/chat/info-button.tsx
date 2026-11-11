"use client";

import { IconButton } from "@ui/icon-button";
import { Sheet } from "@ui/sheet";
import { Info } from "lucide-react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useRef, useState } from "react";

/**
 * The way to a conversation's details from its title (plan §11.3): on a
 * phone its own page, /chat/<id>/info; on a tablet a sheet over the
 * conversation; on a desktop nothing, as the details column is beside it.
 * The details themselves are the server's (ChatDetailsBody), the same in all
 * three. Closed, the sheet gives the focus back to the button.
 */
export function InfoButton({
  href,
  details,
}: {
  /** The phone's details page (`chatPaths.info`; the demo's own on /design). */
  href: string;
  /** What the sheet shows on a tablet. */
  details: ReactNode;
}) {
  const t = useTranslations("app.chat.info");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // What opened the sheet, for the focus once it closed.
  const opener = useRef<HTMLElement | null>(null);

  // Something chosen in it (the person's profile) takes the screen along.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the address is what closes it
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      <IconButton
        href={href}
        label={t("open")}
        icon={<Info />}
        className="md:hidden"
      />
      <IconButton
        label={t("open")}
        icon={<Info />}
        aria-haspopup="dialog"
        onClick={(event) => {
          opener.current = event.currentTarget;
          setOpen(true);
        }}
        className="hidden md:inline-flex xl:hidden"
      />
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={t("open")}
        closeLabel={t("close")}
        returnFocus={() => opener.current}
      >
        <div className="flex flex-col gap-6 px-2 pb-2">{details}</div>
      </Sheet>
    </>
  );
}
