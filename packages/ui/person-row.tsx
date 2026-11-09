import { UserRound } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { AVATAR_PIXELS, Avatar, AvatarPhoto, type AvatarSize } from "./avatar";
import { cn } from "./cn";

const FACE: Record<AvatarSize, string> = {
  sm: "size-8 [&_svg]:size-4",
  md: "size-10 [&_svg]:size-5",
  xl: "size-24 [&_svg]:size-10",
};

/**
 * A person's avatar, or a neutral face when nobody wrote a name down. A
 * photo shows either way.
 */
export function PersonAvatar({
  name,
  photo,
  size = "md",
  className,
}: {
  name: string | null;
  photo?: string | null;
  size?: AvatarSize;
  className?: string;
}) {
  if (name?.trim()) {
    return (
      <Avatar name={name} photo={photo} size={size} className={className} />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-surface-2 text-ink-2",
        FACE[size],
        className,
      )}
    >
      <UserRound />
      {photo ? <AvatarPhoto photo={photo} sizes={AVATAR_PIXELS[size]} /> : null}
    </span>
  );
}

/** People as a grouped list: one soft card, with hairlines from the text on. */
export function PersonList({ className, ...props }: ComponentProps<"ul">) {
  return (
    <ul
      className={cn(
        "overflow-hidden rounded-card bg-surface shadow-card",
        className,
      )}
      {...props}
    />
  );
}

export type PersonRowProps = {
  /** Whose avatar to show; null draws a neutral face. */
  name: string | null;
  /** Their photo, over the initials or the face. */
  photo?: string | null;
  title: ReactNode;
  subtitle?: ReactNode;
  /** A badge or value at the end of the row. */
  trailing?: ReactNode;
  /** Under the text, lined up with it: an action on this person. */
  below?: ReactNode;
  className?: string;
};

/** One person in a PersonList. */
export function PersonRow({
  name,
  photo,
  title,
  subtitle,
  trailing,
  below,
  className,
}: PersonRowProps) {
  return (
    <li
      className={cn(
        "relative flex min-h-16 flex-col justify-center gap-2.5 px-4 py-2.5",
        "not-first:before:absolute not-first:before:end-0 not-first:before:start-[68px] not-first:before:top-0 not-first:before:h-px not-first:before:bg-line not-first:before:content-['']",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <PersonAvatar name={name} photo={photo} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-medium text-ink">{title}</span>
          {subtitle ? (
            <span className="text-ink-2 text-sm">{subtitle}</span>
          ) : null}
        </span>
        {trailing ? <span className="shrink-0">{trailing}</span> : null}
      </div>
      {below ? <div className="ps-[52px]">{below}</div> : null}
    </li>
  );
}
