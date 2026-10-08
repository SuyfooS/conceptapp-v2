import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Card, CardText, CardTitle } from "@ui/card";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { Stat } from "@ui/stat";
import { Send } from "lucide-react";
import Link from "next/link";
import {
  activity,
  byId,
  initials,
  missingAvailability,
  onShiftNow,
  staff,
  tonight,
  totalOpenSlots,
} from "./data";

export default function ShellHome() {
  const missing = missingAvailability.map((id) => byId[id]?.name).join(" ו");
  const inCount = onShiftNow.filter((p) => p.in).length;

  return (
    <PageBody>
      <PageHeader
        title="בוקר טוב, שירן"
        subtitle="יום שלישי, 13 באוקטובר · משמרת בוקר"
        actions={
          <Button asChild variant="secondary">
            <Link href="/design/shell/schedule">לסידור של השבוע הבא</Link>
          </Button>
        }
      />

      <Card
        tone="accent"
        padding="lg"
        className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
      >
        <div className="flex flex-col gap-1">
          <CardTitle>
            {missingAvailability.length} עובדים לא הגישו זמינות לשבוע הבא
          </CardTitle>
          <CardText>{missing}. החלון נסגר ביום חמישי ב־12:00.</CardText>
        </div>
        <Button className="w-full md:w-auto">
          <Send aria-hidden="true" className="rtl:-scale-x-100" />
          שליחת תזכורת
        </Button>
      </Card>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat
          label="במשמרת עכשיו"
          value={`${inCount}/${onShiftNow.length}`}
          hint="שירה עוד לא החתימה"
          tone="warning"
        />
        <Stat
          label="הזמנות הערב"
          value={tonight.bookings}
          hint={`${tonight.covers} סועדים`}
        />
        <Stat
          label="זמינות לשבוע הבא"
          value={`${staff.length - missingAvailability.length}/${staff.length}`}
          hint={`${missingAvailability.length} עדיין לא הגישו`}
          tone="warning"
        />
        <Stat label="משמרות חסרות" value={totalOpenSlots} hint="ב׳ וד׳ בבוקר" />
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <PageSection title="במשמרת עכשיו">
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
                        כניסה <span dir="ltr">{p.in}</span>
                      </Badge>
                    ) : (
                      <Badge tone="warning">לא החתימה</Badge>
                    )
                  }
                />
              );
            })}
          </ListGroup>
        </PageSection>

        <PageSection
          title="הזמנות הערב"
          action={
            <span className="text-ink-2 text-sm">{tonight.covers} סועדים</span>
          }
        >
          <ListGroup>
            {tonight.next.map((b) => (
              <ListRow
                key={b.time + b.name}
                href="/design/shell/reservations"
                leading={<span dir="ltr">{b.time}</span>}
                title={b.name}
                subtitle={`${b.party} סועדים · ${b.table}`}
              />
            ))}
          </ListGroup>
        </PageSection>

        <PageSection title="מה קרה לאחרונה" className="hidden xl:flex">
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
