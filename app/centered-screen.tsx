import { cn } from "@ui/cn";
import { glowClass } from "@ui/page-glow";
import type { ReactNode } from "react";

/**
 * A whole page with one message in its middle, outside the app's frame: a
 * failure, a screen that does not exist, an account with no business.
 */
export function CenteredScreen({ children }: { children: ReactNode }) {
  return (
    <main
      className={cn(
        "flex min-h-dvh items-center justify-center px-4 py-10",
        glowClass,
      )}
    >
      {children}
    </main>
  );
}
