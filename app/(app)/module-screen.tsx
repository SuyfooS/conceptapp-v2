import { canOpenModule, type ModuleKey } from "@domain/modules";
import { manifestFor } from "@modules/registry";
import { Button } from "@ui/button";
import { Card, CardText } from "@ui/card";
import { PageBody, PageHeader } from "@ui/page";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { currentMember } from "./member";
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
  const t = await getTranslations();

  return (
    <PageBody>
      <PageHeader
        title={t(`modules.${moduleKey}.name`)}
        subtitle={t(`modules.${moduleKey}.description`)}
      />
      <Card
        tone="flat"
        padding="lg"
        className="flex flex-col items-start gap-4 md:max-w-xl"
      >
        <CardText>{t("app.moduleSoon.body")}</CardText>
        <Button asChild variant="secondary">
          <Link href="/home">{t("app.moduleSoon.home")}</Link>
        </Button>
      </Card>
    </PageBody>
  );
}
