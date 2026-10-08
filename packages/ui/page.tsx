import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

/**
 * Page frame used inside AppShell. Width and spacing grow with the device:
 * phone 16px gutters, tablet 24px, desktop 32px with a readable max width.
 */
export function PageBody({ className, ...props }: ComponentProps<"main">) {
  return (
    <main
      className={cn(
        "mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 md:gap-8 md:px-6 md:py-8 xl:px-8",
        className,
      )}
      {...props}
    />
  );
}

export type PageHeaderProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  /**
   * The page's main action(s). Full width under the title on phones (easy to
   * hit with a thumb), inline at the end of the header from tablet up.
   */
  actions?: ReactNode;
};

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="font-bold text-xl md:text-2xl">{title}</h1>
        {subtitle ? <p className="text-ink-2">{subtitle}</p> : null}
      </div>
      {actions ? (
        <div className="flex flex-col gap-2 md:flex-row md:items-center [&>*]:w-full md:[&>*]:w-auto">
          {actions}
        </div>
      ) : null}
    </header>
  );
}

export function PageSection({
  title,
  action,
  className,
  children,
}: {
  title: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("flex min-w-0 flex-col gap-3", className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-bold text-md">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
