import { getChatInbox } from "@db/chat";
import { countMyOpenLists } from "@db/lists";
import { pushConfig } from "@db/push/env";
import { waitingChats } from "@domain/chat-sync";
import { accentTokens } from "@domain/color";
import { enabledModules, isStaff, moduleNav } from "@domain/modules";
import { signInPath } from "@domain/passive-sign-in";
import { displayIsraeliMobile } from "@domain/phone";
import { profilePhotoSrc } from "@domain/profile-photos";
import { manifests } from "@modules/registry";
import { accentProps } from "@ui/accent";
import { AppShell, type NavItem } from "@ui/app-shell";
import { AppShellSkeleton } from "@ui/skeleton";
import { House } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { type ReactNode, Suspense } from "react";
import { currentPlatformRole } from "../(admin)/staff";
import { signOut } from "../(auth)/actions";
import { currentBusinesses } from "./businesses";
import { currentWording } from "./current-wording";
import { currentMember } from "./member";
import { moduleIcons } from "./module-icons";
import { currentModules } from "./modules";
import { NoBusinessScreen } from "./no-business";
import { PushRegistration } from "./notifications/push-registration";
import { ViewAsBanner } from "./view-as-banner";
import { baseWording, translator } from "./wording";
import { WordingProvider } from "./wording-provider";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

// The signed-in app. Who is signed in is read per request, so the frame
// streams in behind a Suspense boundary (cacheComponents).
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<Loading />}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}

// Before anyone is read: the app's own words.
function Loading() {
  const t = translator(baseWording, "app");
  return <AppShellSkeleton label={t("loading")} />;
}

async function Shell({ children }: { children: ReactNode }) {
  const member = await currentMember();
  if (!member) redirect(signInPath);

  if (!member.membership) {
    // The ConceptApp team works in the console, not inside a business.
    if (await currentPlatformRole()) redirect("/admin");
    return <NoBusinessScreen signOut={signOut} />;
  }

  const { business, role, perms } = member.membership;
  const on = enabledModules(manifests, business.modules);
  const [enabled, wording, businesses, openLists, chats] = await Promise.all([
    currentModules(),
    currentWording(),
    // Someone in more than one business switches from the sidebar too.
    currentBusinesses(),
    // The Lists tab carries the open lists the person holds; none while
    // viewing as someone, who holds none.
    on.includes("lists") && !member.viewing
      ? countMyOpenLists(member.userId, business.id).catch((error: Error) => {
          console.error("counting open lists failed", error.message);
          return 0;
        })
      : 0,
    // The Chat tab carries the chats with something waiting for the person
    // (`waitingChats`), drawn here and again when a chat screen sees the
    // count move; none while viewing as someone, who reads no chat, and none
    // for someone off the staff, who is in none.
    on.includes("chat") && !member.viewing && isStaff(role)
      ? getChatInbox(business.id)
          .then((rows) => (rows === "notYet" ? 0 : waitingChats(rows)))
          .catch((error: { code?: string }) => {
            console.error(
              "counting chats failed",
              error.code ?? "without a code",
            );
            return 0;
          })
      : 0,
  ]);
  // The business's words: its tab names and role names may be its own.
  const t = translator(wording, "app");
  const tm = translator(wording, "modules");
  // Home carries the notifications that need the person to act (the bell on
  // Today counts them all); none while viewing as someone.
  const toAct =
    enabled.includes("notifications") && !member.viewing
      ? member.unread.action
      : 0;
  // Home, then one item per enabled module the role reaches; someone off the
  // staff (an accountant) gets the modules' own tabs for them instead.
  const nav: NavItem[] = [
    {
      href: "/home",
      label: t("nav.home"),
      icon: <House />,
      exact: true,
      count: toAct > 0 ? toAct : undefined,
    },
    ...moduleNav(manifests, enabled, { role, perms }).map((entry) => ({
      href: entry.href,
      label: entry.outside
        ? tm(`${entry.key}.outsideNav` as never)
        : tm(`${entry.key}.name`),
      icon: moduleIcons[entry.icon],
      count:
        entry.key === "lists" && openLists > 0
          ? openLists
          : entry.key === "chat" && chats > 0
            ? chats
            : undefined,
    })),
  ];
  const name =
    member.name ?? (member.phone ? displayIsraeliMobile(member.phone) : "");
  // Notifications on the phone, where this browser has them on already: none
  // while viewing as someone, and none without the VAPID settings.
  const push =
    enabled.includes("notifications") && !member.viewing ? pushConfig() : null;

  return (
    <div {...accentProps(accentTokens(business.accent))}>
      <WordingProvider overrides={wording.overrides}>
        <AppShell
          businessName={business.name}
          user={{
            name,
            role: t(`roles.${role}`),
            photo: profilePhotoSrc(member.photoPath),
            href: "/me",
          }}
          nav={nav}
          businesses={businesses}
        >
          {member.viewing ? (
            <ViewAsBanner
              viewing={member.viewing}
              businessName={business.name}
              wording={wording}
            />
          ) : null}
          {children}
          {push ? <PushRegistration publicKey={push.publicKey} /> : null}
        </AppShell>
      </WordingProvider>
    </div>
  );
}
