import { Card, CardText, CardTitle } from "@ui/card";
import { PageBody, PageHeader } from "@ui/page";
import { useTranslations } from "next-intl";

export default function ShellTeam() {
  const t = useTranslations("shell");
  return (
    <PageBody>
      <PageHeader title={t("team.title")} subtitle={t("team.subtitle")} />
      <Card tone="raised" padding="lg">
        <CardTitle as="h2">{t("team.placeholder")}</CardTitle>
        <CardText>{t("placeholderText")}</CardText>
      </Card>
    </PageBody>
  );
}
