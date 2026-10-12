import { Card, CardText, CardTitle } from "@ui/card";
import { PageBody, PageHeader } from "@ui/page";
import { useTranslations } from "next-intl";

export default function ShellReservations() {
  const t = useTranslations("shell");
  return (
    <PageBody>
      <PageHeader
        title={t("reservations.title")}
        subtitle={t("reservations.subtitle")}
      />
      <Card tone="raised" padding="lg">
        <CardTitle as="h2">{t("reservations.placeholder")}</CardTitle>
        <CardText>{t("placeholderText")}</CardText>
      </Card>
    </PageBody>
  );
}
