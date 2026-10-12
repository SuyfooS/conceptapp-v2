import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Card, CardText, CardTitle } from "@ui/card";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { Stat } from "@ui/stat";
import { Send } from "lucide-react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import {
  activity,
  byId,
  initials,
  missingAvailability,
  onShiftNow,
  staff,
  tonight,
  totalOpenSlots,
  user,
} from "./data";

export default function ShellHome() {
  const t = useTranslations("shell.home");
  const format = useFormatter();
  const missing = format.list(
    missingAvailability.map((id) => byId[id]?.name ?? id),
    { type: "conjunction" },
  );
  const inCount = onShiftNow.filter((p) => p.in).length;

  return (
    <PageBody>
      <PageHeader
        title={t("greeting", { name: user.name })}
        subtitle={t("today")}
        actions={
          <Button asChild variant="secondary">
            <Link href="/design/shell/schedule">{t("nextWeek")}</Link>
          </Button>
        }
      />

      <Card
        tone="accent"
        padding="lg"
        className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
      >
        <div className="flex flex-col gap-1">
          <CardTitle as="h2">
            {t("missingTitle", { count: missingAvailability.length })}
          </CardTitle>
          <CardText>{t("missingText", { names: missing })}</CardText>
        </div>
        <Button className="w-full md:w-auto">
          <Send aria-hidden="true" className="rtl:-scale-x-100" />
          {t("remind")}
        </Button>
      </Card>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat
          label={t("onShift")}
          value={`${inCount}/${onShiftNow.length}`}
          hint={t("notClockedInHint")}
          tone="warning"
        />
        <Stat
          label={t("tonight")}
          value={tonight.bookings}
          hint={t("covers", { count: tonight.covers })}
        />
        <Stat
          label={t("availability")}
          value={`${staff.length - missingAvailability.length}/${staff.length}`}
          hint={t("notSubmitted", { count: missingAvailability.length })}
          tone="warning"
        />
        <Stat
          label={t("openShifts")}
          value={totalOpenSlots}
          hint={t("openShiftsHint")}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <PageSection title={t("onShift")}>
          <ListGroup>
            {onShiftNow.map((p) => {
              const person = byId[p.id];
              if (!person) return null;
              return (
                <ListRow
                  key={p.id}
                  leading={initials(person.name)}
                  title={person.name}
                  subtitle={person.role}
                  trailing={
                    p.in ? (
                      <Badge tone="success">
                        {t.rich("clockedIn", {
                          time: p.in,
                          ltr: (chunks) => <span dir="ltr">{chunks}</span>,
                        })}
                      </Badge>
                    ) : (
                      <Badge tone="warning">{t("notClockedIn")}</Badge>
                    )
                  }
                />
              );
            })}
          </ListGroup>
        </PageSection>

        <PageSection
          title={t("tonight")}
          action={
            <span className="text-ink-2 text-sm">
              {t("covers", { count: tonight.covers })}
            </span>
          }
        >
          <ListGroup>
            {tonight.next.map((b) => (
              <ListRow
                key={b.time + b.name}
                href="/design/shell/reservations"
                leading={<span dir="ltr">{b.time}</span>}
                title={b.name}
                subtitle={t("booking", { party: b.party, table: b.table })}
              />
            ))}
          </ListGroup>
        </PageSection>

        <PageSection title={t("activity")} className="hidden xl:flex">
          <ListGroup>
            {activity.map((a) => (
              <ListRow
                key={a.time + a.text}
                title={a.text}
                subtitle={
                  <span dir={a.time.includes(":") ? "ltr" : undefined}>
                    {a.time}
                  </span>
                }
              />
            ))}
          </ListGroup>
        </PageSection>
      </div>
    </PageBody>
  );
}
