import { Eye, Lock } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * Who sees what is below it, in one quiet line: an eye for what colleagues
 * see, a lock for what only a few people do.
 */
export function VisibilityNote({
  children,
  icon = "eye",
  className,
}: {
  children: ReactNode;
  icon?: "eye" | "lock";
  className?: string;
}) {
  const Icon = icon === "lock" ? Lock : Eye;
  return (
    <p className={cn("flex items-start gap-1.5 text-ink-2 text-sm", className)}>
      <Icon aria-hidden="true" className="mt-px size-4 shrink-0" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}
