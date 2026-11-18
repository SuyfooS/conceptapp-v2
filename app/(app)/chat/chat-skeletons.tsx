import { ImmersiveScreen } from "@ui/immersive-screen";
import { SkeletonBones } from "@ui/skeleton";
import { baseWording, translator } from "../wording";

/*
 * What shows at once while a chat screen loads, inside the chat layout, so
 * the list beside it stays: neutral and still, as the app's other skeletons.
 * Before the business is read: the app's own words.
 */

function Bone({ className }: { className: string }) {
  return <div className={`rounded-full bg-surface-3 ${className}`} />;
}

/** A conversation on its way: its title, a few messages, its composer. */
export function ConversationSkeleton() {
  const t = translator(baseWording, "app");
  return (
    <div className="flex min-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2.125rem)] min-w-0 flex-col md:min-h-[calc(100dvh-env(safe-area-inset-bottom)-8.5rem)] xl:min-h-[calc(100dvh-3.5rem)]">
      {/* The tab bar steps aside at once, as it will for the conversation. */}
      <ImmersiveScreen />
      <div role="status">
        <h1 className="sr-only">{t("loading")}</h1>
      </div>
      <div
        aria-hidden="true"
        className="flex min-h-14 items-center gap-3 rounded-card bg-surface px-4 py-2 shadow-card"
      >
        <Bone className="size-10 shrink-0" />
        <div className="flex flex-1 flex-col gap-2">
          <Bone className="h-4 w-2/5" />
          <Bone className="h-3 w-3/5" />
        </div>
      </div>
      <div
        aria-hidden="true"
        className="flex flex-1 flex-col justify-end gap-3 py-4"
      >
        <div className="h-12 w-3/5 self-start rounded-card bg-surface-2" />
        <div className="h-16 w-2/3 self-start rounded-card bg-surface-2" />
        <div className="h-12 w-1/2 self-end rounded-card bg-surface-2" />
      </div>
      <div aria-hidden="true" className="h-14 rounded-card bg-surface-2" />
    </div>
  );
}

/** The place beside the list, from tablet up, while /chat loads. */
export function ChooseSkeleton() {
  const t = translator(baseWording, "app");
  return (
    <div className="hidden min-h-[calc(100dvh-env(safe-area-inset-bottom)-10.5rem)] rounded-card bg-surface-2 md:block xl:col-span-2 xl:min-h-[calc(100dvh-4rem)]">
      <div role="status">
        <span className="sr-only">{t("loading")}</span>
      </div>
    </div>
  );
}

/**
 * A chat page that is no conversation, while it loads (a conversation's
 * details, the announcements): its title and a card, beside the list from
 * tablet up, with the tab bar where it is.
 */
export function ChatPageSkeleton() {
  const t = translator(baseWording, "app");
  return (
    <div className="flex min-w-0 flex-col gap-6 md:max-w-2xl xl:col-span-2">
      <div role="status">
        <h1 className="sr-only">{t("loading")}</h1>
      </div>
      <SkeletonBones />
    </div>
  );
}
