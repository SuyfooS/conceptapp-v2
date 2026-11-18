"use client";

import { ListGroup, ListRow } from "@ui/list-row";
import { PageSection } from "@ui/page";
import { Switch } from "@ui/switch";
import { BellRing, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";

/**
 * The switch for this phone as the settings show it once notifications are
 * on, for the design demo: it asks the browser for nothing and sends nothing.
 */
export function DemoDevice() {
  const t = useTranslations("app.notifications.push");
  const titleId = useId();
  const [on, setOn] = useState(true);
  return (
    <PageSection title={t("title", { device: "phone" })}>
      <ListGroup>
        <ListRow
          leading={<BellRing />}
          title={<span id={titleId}>{t("row", { device: "phone" })}</span>}
          subtitle={on ? t("on", { device: "phone" }) : t("off")}
          trailing={
            <Switch aria-labelledby={titleId} checked={on} onChange={setOn} />
          }
        />
        {on ? (
          <ListRow
            leading={<Send className="rtl:-scale-x-100" />}
            title={t("test.action")}
            subtitle={t("test.hint")}
          />
        ) : null}
      </ListGroup>
    </PageSection>
  );
}
