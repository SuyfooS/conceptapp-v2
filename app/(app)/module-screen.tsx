import { canOpenModule, type ModuleKey } from "@domain/modules";
import { manifestFor } from "@modules/registry";
import { Button } from "@ui/button";
import { EmptyState } from "@ui/empty-state";
import { PageBody, PageHeader } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { currentMember } from "./member";
import { moduleIcons } from "./module-icons";
import { currentModules } from "./modules";
import { type AppWording, baseWording, translator } from "./wording";

export async function moduleMetadata(key: ModuleKey): Promise<Metadata> {
  // Page titles stay in the app's own words.
  const t = translator(baseWording, "modules");
  return { title: t(`${key}.name`) };
}

/**
 * The entry screen of a module. A module that is off for the business, or
 * out of reach for the person's role, does not exist for them (the not-found screen), the
 * same as its missing nav item. The module's real screens replace the body
 * as each one is built.
 */
export async function ModuleScreen({
  moduleKey,
  wording,
}: {
  moduleKey: ModuleKey;
  /** The business's words. */
  wording: AppWording;
}) {
  const [member, enabled] = await Promise.all([
    currentMember(),
    currentModules(),
  ]);
  const role = member?.membership?.role;
  if (!role || !canOpenModule(manifestFor(moduleKey), enabled, role)) {
    notFound();
  }
  return (
    <ModuleSoonView moduleKey={moduleKey} homeHref="/home" wording={wording} />
  );
}

/** Also rendered with mock data on /design/shell/module. */
export function ModuleSoonView({
  moduleKey,
  homeHref,
  wording,
}: {
  moduleKey: ModuleKey;
  homeHref: string;
  /** The business's words; the app's own on the demo. */
  wording: AppWording;
}) {
  const t = translator(wording);
  const icon = manifestFor(moduleKey).nav?.icon;
  return (
    <PageBody className={pageGlowClass}>
      <PageHeader
        title={t(`modules.${moduleKey}.name`)}
        subtitle={t(`modules.${moduleKey}.description`)}
      />
      <EmptyState
        icon={icon ? moduleIcons[icon] : null}
        body={t("app.moduleSoon.body")}
        className="md:py-16"
      >
        <Button asChild variant="secondary" size="lg">
          <Link href={homeHref}>{t("app.moduleSoon.home")}</Link>
        </Button>
      </EmptyState>
    </PageBody>
  );
}
