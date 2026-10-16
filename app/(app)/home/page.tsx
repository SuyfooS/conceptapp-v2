import { moduleWidgets } from "@domain/modules";
import { manifests } from "@modules/registry";
import { Button } from "@ui/button";
import { Card, CardText, CardTitle } from "@ui/card";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { signOut } from "../../(auth)/actions";
import { currentMember } from "../member";
import { moduleIcons } from "../module-icons";
import { currentModules } from "../modules";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.home");
  return { title: t("metaTitle") };
}

// Home: a card per enabled module the person's role reaches, from the
// module manifests. Same content on every device; the shell around it
// changes shape.
export default async function HomePage() {
  const [t, tm, member, enabled] = await Promise.all([
    getTranslations("app.home"),
    getTranslations("modules"),
    currentMember(),
    currentModules(),
  ]);
  const firstName = member?.name?.split(" ")[0];
  const role = member?.membership?.role;
  const widgets = role ? moduleWidgets(manifests, enabled, role) : [];

  return (
    <PageBody>
      <PageHeader
        title={firstName ? t("greeting", { name: firstName }) : t("title")}
        subtitle={member?.membership?.business.name}
      />
      {widgets.length > 0 ? (
        <PageSection title={t("modulesTitle")} className="md:max-w-xl">
          <ListGroup>
            {widgets.map((widget) => (
              <ListRow
                key={widget.key}
                href={widget.href}
                leading={moduleIcons[widget.icon]}
                title={tm(`${widget.key}.name`)}
                subtitle={tm(`${widget.key}.description`)}
              />
            ))}
          </ListGroup>
        </PageSection>
      ) : (
        <Card
          tone="flat"
          padding="lg"
          className="flex flex-col gap-2 md:max-w-xl"
        >
          <CardTitle as="h2">{t("empty.title")}</CardTitle>
          <CardText>{t("empty.body")}</CardText>
        </Card>
      )}
      <form action={signOut}>
        <Button type="submit" variant="secondary" className="w-full md:w-auto">
          {t("signOut")}
        </Button>
      </form>
    </PageBody>
  );
}
