import { cn } from "@ui/cn";
import { Logo } from "@ui/logo";
import { glowClass } from "@ui/page-glow";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

/**
 * The door to the app. Phone: no card, a large title, and the task right under
 * the thumb. Tablet and desktop: the same task on a floating card in the middle
 * of the page. Fields on the card sit in a well (`authFieldsClass`), since the
 * card and a field group are both white.
 */
export function AuthScreen({
  title,
  children,
}: {
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <AuthPage>
      <Wordmark />
      <h1 className="mt-[9dvh] mb-3 text-balance px-1 font-bold text-2xl md:mt-6">
        {title}
      </h1>
      {children}
    </AuthPage>
  );
}

export const authFieldsClass = "md:bg-bg md:shadow-none";

/** The page and, from tablet up, the card. Without the title, for a hero. */
export function AuthPage({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <main
      className={cn(
        "flex min-h-dvh flex-col px-4 pt-[calc(env(safe-area-inset-top)+1.25rem)] pb-8 md:items-center md:justify-center md:px-8 md:py-16",
        glowClass,
        "md:bg-size-[100%_560px]",
      )}
    >
      <div
        className={cn(
          "flex w-full flex-col md:max-w-[460px] md:rounded-sheet md:bg-surface md:p-10 md:shadow-float",
          className,
        )}
      >
        {children}
      </div>
    </main>
  );
}

function Wordmark() {
  const t = useTranslations("auth");
  return (
    <div className="px-1">
      <Logo label={t("brand")} />
    </div>
  );
}
