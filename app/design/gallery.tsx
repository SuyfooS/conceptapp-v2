"use client";

import { accentTokens } from "@domain/color";
import { accentStyle } from "@ui/accent";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Card, CardText, CardTitle } from "@ui/card";
import { cn } from "@ui/cn";
import { IconButton } from "@ui/icon-button";
import { ListGroup, ListRow } from "@ui/list-row";
import { PhoneField, type PhoneValue } from "@ui/phone-field";
import { ltrInputClass, TextField } from "@ui/text-field";
import { ArrowLeft, Bell, Plus } from "lucide-react";
import { type ReactNode, useState } from "react";

type Lang = "he" | "en";

const ACCENTS = [
  { hex: "#8b2635", he: "בורדו", en: "Burgundy" },
  { hex: "#9000ff", he: "סגול", en: "Purple" },
  { hex: "#1f6f50", he: "ירוק", en: "Green" },
  { hex: "#1d5fa8", he: "כחול", en: "Blue" },
  { hex: "#c46b84", he: "ורוד עתיק", en: "Dusty pink" },
  { hex: "#e0a800", he: "חרדל", en: "Mustard" },
] as const;

const T = {
  he: {
    title: "מערכת העיצוב",
    intro:
      "כל הרכיבים במקום אחד, בצבע של העסק ובשני הכיוונים. רכיב חדש נבדק כאן לפני שמשתמשים בו.",
    accent: "צבע העסק",
    direction: "שפה וכיוון",
    adjusted: (from: string, to: string) => (
      <>
        הצבע {from} הוכהה ל־<span dir="ltr">{to}</span> כדי שהכפתורים והטקסט
        עליהם יישארו קריאים.
      </>
    ),
    colors: "צבעים",
    type: "טיפוגרפיה",
    sample: "משמרת בוקר ב־09:00",
    buttons: "כפתורים",
    primary: "פרסום הסידור",
    secondary: "העתקה משבוע שעבר",
    ghost: "ביטול",
    danger: "מחיקת משמרת",
    loading: "שומר…",
    disabled: "לא זמין",
    wide: "התחברות",
    add: "הוספה",
    notifications: "התראות",
    back: "חזרה",
    fields: "שדות",
    name: "שם מלא",
    namePh: "למשל נועה כהן",
    shift: "שם המשמרת",
    shiftHint: "יופיע לעובדים בסידור",
    shiftDefault: "ערב",
    hours: "שעות",
    hoursError: "שעת הסיום לפני שעת ההתחלה",
    locked: "סניף",
    lockedValue: "סניף ראשי",
    phone: "טלפון נייד",
    phoneValid: "תקין",
    phoneIncomplete: "לא שלם",
    cards: "כרטיסים",
    flat: "שטוח",
    flatText: "גבול בלבד. לשורות ולתוכן משני.",
    raised: "מורם",
    raisedText: "צל רך. לדבר המרכזי במסך.",
    accentCard: "מודגש",
    accentText: "בצבע העסק. לדבר אחד שדורש פעולה עכשיו, לכל היותר אחד במסך.",
    rows: "שורות ברשימה",
    p1: "נועה כהן",
    p1s: "מלצרית · משמרת בוקר",
    p1b: "במשמרת",
    p2: "יואב לוי",
    p2s: "בר · משמרת ערב",
    p2b: "לא הגיש זמינות",
    p3: "שולחן 12",
    p3s: "4 סועדים · 20:30",
    p3b: "מאושר",
    badges: "תגיות",
    neutral: "טיוטה",
    accentB: "מאושר",
    success: "פורסם",
    warning: "ממתין",
    dangerB: "לא הגיע",
  },
  en: {
    title: "Design system",
    intro:
      "Every component in one place, in the business accent and in both directions. New components are checked here before use.",
    accent: "Business accent",
    direction: "Language and direction",
    adjusted: (from: string, to: string) => (
      <>
        {from} was darkened to <span dir="ltr">{to}</span> so buttons and their
        text stay readable.
      </>
    ),
    colors: "Colours",
    type: "Typography",
    sample: "Morning shift at 09:00",
    buttons: "Buttons",
    primary: "Publish schedule",
    secondary: "Copy last week",
    ghost: "Cancel",
    danger: "Delete shift",
    loading: "Saving…",
    disabled: "Unavailable",
    wide: "Sign in",
    add: "Add",
    notifications: "Notifications",
    back: "Back",
    fields: "Fields",
    name: "Full name",
    namePh: "e.g. Noa Cohen",
    shift: "Shift name",
    shiftHint: "Shown to staff on the schedule",
    shiftDefault: "Evening",
    hours: "Hours",
    hoursError: "End time is before start time",
    locked: "Branch",
    lockedValue: "Main branch",
    phone: "Mobile number",
    phoneValid: "Valid",
    phoneIncomplete: "Incomplete",
    cards: "Cards",
    flat: "Flat",
    flatText: "Border only. For rows and secondary content.",
    raised: "Raised",
    raisedText: "Soft shadow. For the main object on a screen.",
    accentCard: "Accent",
    accentText:
      "In the business accent. For the one thing that needs action now, at most one per screen.",
    rows: "List rows",
    p1: "Noa Cohen",
    p1s: "Waiter · Morning shift",
    p1b: "On shift",
    p2: "Yoav Levi",
    p2s: "Bar · Evening shift",
    p2b: "No availability",
    p3: "Table 12",
    p3s: "4 guests · 20:30",
    p3b: "Confirmed",
    badges: "Badges",
    neutral: "Draft",
    accentB: "Confirmed",
    success: "Published",
    warning: "Pending",
    dangerB: "No-show",
  },
} as const;

const SWATCHES = [
  { token: "bg", cls: "bg-bg" },
  { token: "surface", cls: "bg-surface" },
  { token: "surface-2", cls: "bg-surface-2" },
  { token: "line", cls: "bg-line" },
  { token: "ink", cls: "bg-ink" },
  { token: "ink-2", cls: "bg-ink-2" },
  { token: "accent", cls: "bg-accent" },
  { token: "accent-soft", cls: "bg-accent-soft" },
  { token: "success", cls: "bg-success" },
  { token: "warning", cls: "bg-warning" },
  { token: "danger", cls: "bg-danger" },
] as const;

const SCALE = [
  { cls: "text-2xl font-bold", label: "2xl · 30" },
  { cls: "text-xl font-bold", label: "xl · 24" },
  { cls: "text-lg font-medium", label: "lg · 20" },
  { cls: "text-md", label: "md · 17" },
  { cls: "text-base", label: "base · 15" },
  { cls: "text-sm", label: "sm · 13" },
] as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-bold text-ink-2 text-sm">{title}</h2>
      {children}
    </section>
  );
}

export function Gallery() {
  const [lang, setLang] = useState<Lang>("he");
  const [requested, setRequested] = useState<string>(ACCENTS[0].hex);
  const [phone, setPhone] = useState<PhoneValue>({ display: "", e164: null });

  const switchLang = (next: Lang) => {
    setLang(next);
    setPhone({ display: "", e164: null }); // the fields remount empty in the new language
  };

  const t = T[lang];
  const tokens = accentTokens(requested);
  const accentName =
    ACCENTS.find((a) => a.hex === requested)?.[lang] ?? requested;

  return (
    <div
      dir={lang === "he" ? "rtl" : "ltr"}
      lang={lang}
      style={accentStyle(tokens)}
      className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col gap-8 px-4 py-8"
    >
      <header className="flex flex-col gap-2">
        <span
          dir="ltr"
          className="flex items-center gap-2 self-start font-bold text-md"
        >
          <span aria-hidden="true" className="size-4 rounded-[5px] bg-brand" />
          ConceptApp
        </span>
        <h1 className="font-bold text-2xl">{t.title}</h1>
        <p className="text-ink-2">{t.intro}</p>
      </header>

      <Card tone="raised" padding="lg" className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <span className="font-medium text-sm">{t.accent}</span>
          <div className="flex flex-wrap gap-2">
            {ACCENTS.map((a) => (
              <button
                key={a.hex}
                type="button"
                onClick={() => setRequested(a.hex)}
                aria-pressed={requested === a.hex}
                className={cn(
                  "flex h-11 items-center gap-2 rounded-full border px-3 text-sm transition-colors duration-150",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                  requested === a.hex
                    ? "border-ink bg-surface"
                    : "border-line bg-surface hover:bg-surface-2",
                )}
              >
                <span
                  aria-hidden="true"
                  className="size-4 rounded-full"
                  style={{ background: a.hex }}
                />
                {a[lang]}
              </button>
            ))}
          </div>
          {tokens.adjusted ? (
            <p className="text-ink-2 text-sm">
              {t.adjusted(accentName, tokens.accent)}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <span className="font-medium text-sm">{t.direction}</span>
          <div className="flex gap-2">
            <Button
              variant={lang === "he" ? "primary" : "secondary"}
              aria-pressed={lang === "he"}
              onClick={() => switchLang("he")}
            >
              עברית
            </Button>
            <Button
              variant={lang === "en" ? "primary" : "secondary"}
              aria-pressed={lang === "en"}
              onClick={() => switchLang("en")}
            >
              English
            </Button>
          </div>
        </div>
      </Card>

      <Section title={t.colors}>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {SWATCHES.map((s) => (
            <div key={s.token} className="flex flex-col gap-1.5">
              <span
                className={cn("h-12 rounded-control border border-line", s.cls)}
              />
              <span dir="ltr" className="text-start text-ink-2 text-sm">
                {s.token}
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section title={t.type}>
        <Card className="flex flex-col gap-3">
          {SCALE.map((s) => (
            <div
              key={s.label}
              className="flex items-baseline justify-between gap-4"
            >
              <span className={cn(s.cls, "min-w-0")}>{t.sample}</span>
              <span dir="ltr" className="shrink-0 text-ink-2 text-sm">
                {s.label}
              </span>
            </div>
          ))}
        </Card>
      </Section>

      <Section title={t.buttons}>
        <div className="flex flex-wrap gap-2">
          <Button>{t.primary}</Button>
          <Button variant="secondary">{t.secondary}</Button>
          <Button variant="ghost">{t.ghost}</Button>
          <Button variant="danger">{t.danger}</Button>
          <Button loading>{t.loading}</Button>
          <Button disabled>{t.disabled}</Button>
        </div>
        <Button size="lg" className="w-full">
          {t.wide}
        </Button>
        <div className="flex gap-2">
          <IconButton label={t.add} icon={<Plus />} variant="secondary" />
          <IconButton label={t.notifications} icon={<Bell />} />
          <IconButton label={t.back} icon={<ArrowLeft />} directional />
        </div>
      </Section>

      <Section title={t.fields}>
        <Card key={lang} padding="lg" className="flex flex-col gap-4">
          <TextField
            label={t.name}
            placeholder={t.namePh}
            autoComplete="name"
          />
          <TextField
            label={t.shift}
            hint={t.shiftHint}
            defaultValue={t.shiftDefault}
          />
          <TextField
            label={t.hours}
            error={t.hoursError}
            defaultValue="22:00–17:00"
            dir="ltr"
            className={ltrInputClass}
          />
          <TextField label={t.locked} defaultValue={t.lockedValue} disabled />
          <div className="flex flex-col gap-2">
            <PhoneField label={t.phone} name="phone" onPhoneChange={setPhone} />
            <div>
              {phone.e164 ? (
                <Badge tone="success">
                  {t.phoneValid} · <span dir="ltr">{phone.e164}</span>
                </Badge>
              ) : (
                <Badge>{t.phoneIncomplete}</Badge>
              )}
            </div>
          </div>
        </Card>
      </Section>

      <Section title={t.cards}>
        <Card>
          <CardTitle>{t.flat}</CardTitle>
          <CardText>{t.flatText}</CardText>
        </Card>
        <Card tone="raised">
          <CardTitle>{t.raised}</CardTitle>
          <CardText>{t.raisedText}</CardText>
        </Card>
        <Card tone="accent">
          <CardTitle>{t.accentCard}</CardTitle>
          <CardText>{t.accentText}</CardText>
        </Card>
      </Section>

      <Section title={t.rows}>
        <ListGroup>
          <ListRow
            href="/design"
            leading={lang === "he" ? "נכ" : "NC"}
            title={t.p1}
            subtitle={t.p1s}
            trailing={<Badge tone="success">{t.p1b}</Badge>}
          />
          <ListRow
            onClick={() => {}}
            leading={lang === "he" ? "יל" : "YL"}
            title={t.p2}
            subtitle={t.p2s}
            trailing={<Badge tone="warning">{t.p2b}</Badge>}
          />
          <ListRow
            title={t.p3}
            subtitle={t.p3s}
            trailing={<Badge tone="accent">{t.p3b}</Badge>}
          />
        </ListGroup>
      </Section>

      <Section title={t.badges}>
        <div className="flex flex-wrap gap-2">
          <Badge>{t.neutral}</Badge>
          <Badge tone="accent">{t.accentB}</Badge>
          <Badge tone="success">{t.success}</Badge>
          <Badge tone="warning">{t.warning}</Badge>
          <Badge tone="danger">{t.dangerB}</Badge>
        </div>
      </Section>
    </div>
  );
}
