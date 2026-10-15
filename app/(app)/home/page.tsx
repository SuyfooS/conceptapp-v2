import { Button } from "@ui/button";
import { Card, CardText, CardTitle } from "@ui/card";
import { PageBody, PageHeader } from "@ui/page";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { signOut } from "../../(auth)/actions";
import { currentMember } from "../member";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.home");
  return { title: t("metaTitle") };
}

// The empty home: modules fill it with their widgets from chunk 1a on.
// Same content on every device; the shell around it changes shape.
export default async function HomePage() {
  const t = await getTranslations("app.home");
  const member = await currentMember();
  const firstName = member?.name?.split(" ")[0];

  return (
    <PageBody>
      <PageHeader
        title={firstName ? t("greeting", { name: firstName }) : t("title")}
        subtitle={member?.membership?.business.name}
      />
      <Card
        tone="flat"
        padding="lg"
        className="flex flex-col gap-2 md:max-w-xl"
      >
        <CardTitle as="h2">{t("empty.title")}</CardTitle>
        <CardText>{t("empty.body")}</CardText>
      </Card>
      <form action={signOut}>
        <Button type="submit" variant="secondary" className="w-full md:w-auto">
          {t("signOut")}
        </Button>
      </form>
    </PageBody>
  );
}
