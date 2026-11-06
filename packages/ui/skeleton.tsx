import { cn } from "./cn";
import { PageBody } from "./page";
import { pageGlowClass } from "./page-glow";

function Bone({ className }: { className?: string }) {
  return <div className={cn("rounded-full bg-surface-3", className)} />;
}

function RowBones() {
  return (
    <div className="flex min-h-16 items-center gap-3 px-4 py-2.5">
      <Bone className="size-10 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Bone className="h-4 w-2/5" />
        <Bone className="h-3 w-3/5" />
      </div>
    </div>
  );
}

/**
 * The shape of a screen before its data arrives: a large title, a large card and
 * a list. Neutral on purpose, since the business's colour may not be known yet,
 * and still: it marks a wait, so it doesn't draw the eye.
 */
export function SkeletonBones() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 pt-1">
        <Bone className="h-9 w-3/5 max-w-xs" />
        <Bone className="h-4 w-2/5 max-w-[12rem]" />
      </div>
      <div className="flex flex-col gap-6 md:grid md:grid-cols-2 md:items-start md:gap-8">
        <div className="h-44 rounded-[32px] bg-surface-2" />
        <div className="rounded-card bg-surface shadow-card">
          <RowBones />
          <RowBones />
          <RowBones />
        </div>
      </div>
    </div>
  );
}

/**
 * What shows at once while a screen loads. `label` says so to a screen reader,
 * and as a heading, so the page has one until the real title replaces it.
 */
export function PageSkeleton({ label }: { label: string }) {
  return (
    <PageBody className={pageGlowClass}>
      <div role="status">
        <h1 className="sr-only">{label}</h1>
      </div>
      <SkeletonBones />
    </PageBody>
  );
}

/**
 * The whole frame, for a first load before anyone is known: the same places as
 * AppShell's sidebar and tab bar, with nothing in them yet.
 */
export function AppShellSkeleton({ label }: { label: string }) {
  return (
    <div className="min-h-dvh bg-bg">
      <div
        aria-hidden="true"
        className="fixed inset-y-3 start-3 z-20 hidden w-64 flex-col gap-3 rounded-card bg-surface p-5 shadow-card xl:flex"
      >
        <div className="flex items-center gap-3">
          <Bone className="size-10 shrink-0 rounded-control" />
          <Bone className="h-5 w-2/3" />
        </div>
        <div className="mt-3 flex flex-col gap-5 px-1">
          <Bone className="h-4 w-3/5" />
          <Bone className="h-4 w-1/2" />
          <Bone className="h-4 w-3/5" />
          <Bone className="h-4 w-2/5" />
        </div>
      </div>

      <div className="pb-[calc(env(safe-area-inset-bottom)+6.5rem)] xl:ps-[17.5rem] xl:pb-0">
        <PageSkeleton label={label} />
      </div>

      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+14px)] z-30 flex md:justify-center xl:hidden"
      >
        <div className="glass h-16 w-full rounded-full md:max-w-[480px]" />
      </div>
    </div>
  );
}
