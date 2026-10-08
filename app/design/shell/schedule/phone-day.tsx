"use client";

import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { ListGroup, ListRow } from "@ui/list-row";
import { WeekStrip } from "@ui/week-strip";
import { Plus } from "lucide-react";
import { useState } from "react";
import { assigned, byId, days, initials, openSlots } from "../data";

/** Phone: one day at a time, picked from a week strip. */
export function PhoneDay() {
  const [dayKey, setDayKey] = useState("sun");
  const day = days.find((d) => d.key === dayKey) ?? days[0];
  if (!day) return null;

  return (
    <div className="flex flex-col gap-4">
      <WeekStrip
        label="בחירת יום"
        value={dayKey}
        onChange={setDayKey}
        days={days.map((d) => ({
          key: d.key,
          label: d.label,
          date: d.date,
          marked: openSlots(d) > 0,
          markLabel: "חסר עובד",
        }))}
      />

      <h2 className="font-bold text-lg">
        יום {day.long}, {day.date} באוקטובר
      </h2>

      {day.shifts.map((shift) => {
        const people = assigned(day, shift);
        const missing = Math.max(0, shift.needed - people.length);
        return (
          <Card key={shift.key} padding="none" className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex flex-col">
                <span className="font-bold text-md">{shift.name}</span>
                <span dir="ltr" className="self-start text-ink-2 text-sm">
                  {shift.time}
                </span>
              </div>
              {missing > 0 ? (
                <Badge tone="warning">חסר {missing}</Badge>
              ) : (
                <Badge tone="success">
                  {people.length}/{shift.needed}
                </Badge>
              )}
            </div>
            <ListGroup className="rounded-none border-x-0 border-b-0">
              {people.map((id) => {
                const p = byId[id];
                if (!p) return null;
                return (
                  <ListRow
                    key={id}
                    onClick={() => {}}
                    leading={initials(p.name)}
                    title={p.name}
                    subtitle={p.role}
                  />
                );
              })}
            </ListGroup>
            {missing > 0 ? (
              <div className="border-line border-t p-3">
                <Button
                  variant="ghost"
                  className="w-full border border-line border-dashed"
                >
                  <Plus aria-hidden="true" />
                  הוספת עובד למשמרת
                </Button>
              </div>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}
