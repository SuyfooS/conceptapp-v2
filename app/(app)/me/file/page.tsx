import { Button } from "@ui/button";
import { EmptyState } from "@ui/empty-state";
import { PageBody, PageHeader } from "@ui/page";
import { FileText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { currentWording } from "../../current-wording";
import { currentMember } from "../../member";
import {
  type AppWording,
  baseWording,
  englishWording,
  translator,
} from "../../wording";
import { saveMyProfileAction } from "../actions";
import {
  confirmBankAction,
  disputeBankChangeAction,
  handInForm101Action,
  revealOwnAction,
  saveFileStepAction,
  sendBankCodeAction,
  submitFileAction,
} from "./actions";
import { currentFileScreen } from "./file";
import { FileView, fileViewOf } from "./file-view";

export async function generateMetadata(): Promise<Metadata> {
  // Page titles stay in the app's own words.
  const t = translator(baseWording, "app.file");
  return { title: t("metaTitle") };
}

// The signed-in person's own hiring file (profile H5a), from the profile.
// `?step=` names the step on screen, never a value. The module off, or
// someone off the staff, gets the not-found screen, as a module's screens
// do. Dynamic and per person, so it answers no-store, and nothing here is
// cached.
export default async function FilePage({
  searchParams,
}: PageProps<"/me/file">) {
  const [{ step }, screen, member, wording] = await Promise.all([
    searchParams,
    currentFileScreen(),
    currentMember(),
    currentWording(),
  ]);
  if (screen.kind === "closed") notFound();
  if (screen.kind !== "file") {
    const english = member?.profile.locale === "en";
    return (
      <FileUnavailable
        wording={english ? englishWording : wording}
        english={english}
        business={member?.membership?.business.name ?? ""}
        why={screen.kind === "viewing" ? "viewing" : "keys"}
      />
    );
  }
  const { data } = screen;
  const business = data.businessId;
  return (
    <FileView
      data={data}
      view={fileViewOf(step, data.steps)}
      actions={{
        saveStep: saveFileStepAction.bind(null, business),
        reveal: revealOwnAction.bind(null, business),
        sendBankCode: sendBankCodeAction.bind(null, business),
        confirmBank: confirmBankAction.bind(null, business),
        handInForm101: handInForm101Action.bind(null, business),
        submit: submitFileAction.bind(null, business),
        saveProfile: saveMyProfileAction,
        disputeBankChange: disputeBankChangeAction.bind(null, business),
      }}
    />
  );
}

/**
 * No file to show: the ConceptApp team viewing as a role reads none, and a
 * deployment without the keys (or before the migration) can't open one yet.
 */
function FileUnavailable({
  wording,
  english,
  business,
  why,
}: {
  wording: AppWording;
  english: boolean;
  business: string;
  why: "viewing" | "keys";
}) {
  const t = translator(wording, "app.file");
  return (
    <div dir={english ? "ltr" : undefined} lang={english ? "en" : undefined}>
      <PageBody>
        <PageHeader
          title={t("title", { business })}
          back={{ href: "/me", label: t("back") }}
        />
        <EmptyState
          icon={<FileText />}
          headingLevel="h2"
          body={why === "viewing" ? t("viewing") : t("failures.keys")}
        >
          <Button asChild variant="secondary">
            <Link href="/me">{t("back")}</Link>
          </Button>
        </EmptyState>
      </PageBody>
    </div>
  );
}
