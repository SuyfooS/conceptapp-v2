"use client";

import { Button } from "@ui/button";
import { cn } from "@ui/cn";
import { ListRow } from "@ui/list-row";
import Link from "next/link";
import { type ReactNode, useTransition } from "react";
import { useFormStatus } from "react-dom";

/**
 * One line of the inbox. Pressing it runs `open`, which marks it read on the
 * server and goes where it leads: a button, not a link, so a prefetch never
 * marks a line read. On the demo, with no `open`, it is a plain link.
 */
export function InboxRow({
  id,
  href,
  open,
  title,
  subtitle,
  leading,
  trailing,
}: {
  id: string;
  /** Where the line leads; used as a link only when there is no `open`. */
  href: string;
  open: ((id: string) => Promise<void>) | null;
  title: ReactNode;
  subtitle?: ReactNode;
  leading: ReactNode;
  trailing: ReactNode;
}) {
  const [pending, startTransition] = useTransition();
  const content = { title, subtitle, leading, trailing };
  if (!open) return <ListRow href={href} {...content} />;
  return (
    <ListRow
      {...content}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await open(id);
        })
      }
    />
  );
}

/**
 * What a line says, pressable, in a cell of the computer's table: like
 * `InboxRow`, a button that runs `open`, or a plain link on the demo.
 */
export function InboxOpen({
  id,
  href,
  open,
  className,
  children,
}: {
  id: string;
  href: string;
  open: ((id: string) => Promise<void>) | null;
  className?: string;
  children: ReactNode;
}) {
  const [pending, startTransition] = useTransition();
  if (!open) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <button
      type="button"
      disabled={pending}
      className={cn(className, pending && "opacity-50")}
      onClick={() =>
        startTransition(async () => {
          await open(id);
        })
      }
    >
      {children}
    </button>
  );
}

/** "Mark all as read", quiet at the head of the new lines, inside its form. */
export function ReadAllButton({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="ghost"
      loading={pending}
      className="-me-3 text-ink-2"
    >
      {children}
    </Button>
  );
}
