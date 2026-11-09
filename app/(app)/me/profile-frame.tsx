import type { CoverPreset } from "@domain/profile";
import { ProfileCover } from "@ui/profile-cover";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The ring around a profile's large photo: the page's colour on phones, where
 * the cover runs to the edges, and the card's from tablet up, where it sits in
 * one (a page-coloured ring would show as a grey band on the card).
 */
export const profileAvatarRing =
  "shadow-[0_0_0_4px_var(--bg),var(--float-shadow)] md:shadow-[0_0_0_4px_var(--surface),var(--float-shadow)]";

/**
 * A profile's shape, the same for one's own (/me) and a colleague's
 * (/team/[person]). Phone: the cover runs to the edges with a way back on it,
 * the photo overlaps it, the name and the rest under it, then the rows. Tablet
 * and desktop: an identity card that stays in view on the start side, the rows
 * on the end side. No state of its own, so a server view and a client one can
 * both draw it.
 */
export function ProfileFrame({
  label,
  cover,
  hue,
  back,
  avatar,
  identity,
  children,
}: {
  /** Whose profile it is, for the identity's landmark. */
  label: string;
  cover: CoverPreset;
  /** The person's avatar hue, for the covers that take a touch of it. */
  hue: number;
  back: { href: string; label: string };
  /** The large photo, with anything that sits on it. */
  avatar: ReactNode;
  /** The name, the line under it, and what follows them. */
  identity: ReactNode;
  /** The end column: the rows. */
  children: ReactNode;
}) {
  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:items-start md:gap-8 xl:grid-cols-[minmax(0,4fr)_minmax(0,6fr)]">
      <section
        aria-label={label}
        className="min-w-0 md:sticky md:top-8 md:overflow-hidden md:rounded-card md:bg-surface md:pb-5 md:shadow-card"
      >
        <ProfileCover
          preset={cover}
          hue={hue}
          className="-mx-4 -mt-[calc(env(safe-area-inset-top)+1.25rem)] h-[calc(env(safe-area-inset-top)+150px)] rounded-b-sheet md:mx-0 md:mt-0 md:h-[140px] md:rounded-none xl:h-40"
        >
          <Link
            href={back.href}
            className="pressable absolute start-3 top-[calc(env(safe-area-inset-top)+0.75rem)] flex min-h-11 items-center gap-0.5 rounded-full bg-accent-press ps-2 pe-4 font-semibold text-accent-ink text-base focus-visible:outline-2 focus-visible:outline-accent-ink md:top-3"
          >
            <ChevronRight
              aria-hidden="true"
              className="size-5 ltr:-scale-x-100"
            />
            {back.label}
          </Link>
        </ProfileCover>
        <div className="relative -mt-12 ps-1 md:px-5">
          <div className="relative size-24">{avatar}</div>
          <div className="mt-3 flex flex-col gap-3">{identity}</div>
        </div>
      </section>
      <div className="flex min-w-0 flex-col gap-6">{children}</div>
    </div>
  );
}
