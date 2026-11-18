import { ListGroup, ListRow } from "@ui/list-row";
import { PageSection } from "@ui/page";
import { FileText } from "lucide-react";
import { type AppWording, translator } from "../../wording";

/**
 * The profile's way to the documents (chat C7): "המסמכים שלי" for someone on
 * the staff, "מסמכים" for the office, with how many wait for the person's
 * "קראתי" when some do. Also on /design/shell/me with mock data.
 */
export function MyDocumentsSection({
  wording,
  href,
  office,
  toConfirm,
}: {
  wording: AppWording;
  href: string;
  /** In the office: every document of the business, not only their own. */
  office: boolean;
  /** Sent to them asking for "קראתי", not given yet. */
  toConfirm: number;
}) {
  const t = translator(wording, "app.me.documents");
  return (
    <PageSection title={t("title")}>
      <ListGroup>
        <ListRow
          href={href}
          leading={<FileText />}
          title={office ? t("all") : t("mine")}
          subtitle={
            toConfirm > 0
              ? t("toConfirm", { count: toConfirm })
              : office
                ? t("officeHint")
                : t("hint")
          }
        />
      </ListGroup>
    </PageSection>
  );
}
