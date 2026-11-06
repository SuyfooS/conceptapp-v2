import { canOpenModule, type ModuleKey } from "@domain/modules";
import { manifestFor } from "@modules/registry";
import { Button } from "@ui/button";
import { EmptyState } from "@ui/empty-state";
import { PageBody, PageHeader } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { currentMember } from "./member";
import { moduleIcons } from "./module-icons";
import { currentModules } from "./modules";

export async function moduleMetadata(key: ModuleKey): Promise<Metadata> {
  const t = await getTranslations("modules");
  return { title: t(`${key}.name`) };
}

/**
 * The entry screen of a module. A module that is off for the business, or
 * out of reach for the person's role, does not exist for them (the not-found screen), the
 * same as its missing nav item. The module's real screens replace the body
 * as each one is built.
 */
export async function ModuleScreen({ moduleKey }: { moduleKey: ModuleKey }) {
  const [member, enabled] = await Promise.all([
    currentMember(),
    currentModules(),
  ]);
  const role = member?.membership?.role;
  if (!role || !canOpenModule(manifestFor(moduleKey), enabled, role)) {
    notFound();
  }
  return <ModuleSoonView moduleKey={moduleKey} homeHref="/home" />;
}

/** Also rendered with mock data on /design/shell/module. */
export async function ModuleSoonView({
  moduleKey,
  homeHref,
}: {
  moduleKey: ModuleKey;
  homeHref: string;
}) {
  const t = await getTranslations();
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
