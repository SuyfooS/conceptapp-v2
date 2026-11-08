import { getBusinessSetup } from "@db/admin";
import { getWordingForTeam } from "@db/wording";
import { platformCan } from "@domain/platform";
import { type MessageTree, wordingEntries } from "@domain/wording";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import he from "@/messages/he.json";
import { currentPlatformRole } from "../../../../staff";
import { saveBusinessWordingAction } from "../actions";
import { WordingView } from "./wording-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.wording");
  return { title: t("title") };
}

export default async function BusinessWordingPage({
  params,
}: PageProps<"/admin/businesses/[slug]/wording">) {
  const role = await currentPlatformRole();
  if (!platformCan(role, "businesses.edit")) notFound();
  const { slug } = await params;
  const business = await getBusinessSetup(slug);
  if (!business) notFound();
  const stored = await getWordingForTeam(business.id);
  const sentences = (rows: { key: string; sentence: string }[]) =>
    Object.fromEntries(rows.map((r) => [r.key, r.sentence]));
  return (
    <WordingView
      name={business.name}
      backHref={`/admin/businesses/${business.slug}`}
      entries={wordingEntries(
        he as MessageTree,
        sentences(stored.template),
        sentences(stored.business),
      )}
      save={saveBusinessWordingAction.bind(null, business.id)}
    />
  );
}
