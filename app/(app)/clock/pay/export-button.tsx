"use client";

import { Button } from "@ui/button";
import { StatusToast } from "@ui/status-toast";
import { Download } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** How long after a press the page reads the log again, for the line about the last file. */
const REFRESH_MS = 2500;

/**
 * The pay screen's main action (payroll P8): the month's file for payroll. A
 * plain `<a download>`, never a `<Link>`, so no prefetch asks for the file
 * (asking for it writes its row to the log). A press says what to do with
 * the file, then reads the page again, so the line about the last file
 * follows.
 */
export function ExportButton({
  href,
  label,
  done,
}: {
  /** The file's address, `?month=` included. */
  href: string;
  label: string;
  /** What a press shows. */
  done: string;
}) {
  const router = useRouter();
  const [stamp, setStamp] = useState<string | null>(null);
  return (
    <div className="flex flex-col">
      <Button asChild className="w-full md:w-auto">
        <a
          href={href}
          download
          onClick={() => {
            setStamp(String(Date.now()));
            window.setTimeout(() => router.refresh(), REFRESH_MS);
          }}
        >
          <Download aria-hidden="true" />
          {label}
        </a>
      </Button>
      <StatusToast
        message={stamp ? done : null}
        stamp={stamp ?? undefined}
        duration={6000}
      />
    </div>
  );
}
