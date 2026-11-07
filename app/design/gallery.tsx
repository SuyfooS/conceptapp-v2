"use client";

import { accentTokens } from "@domain/color";
import { accentProps } from "@ui/accent";
import { Ambient } from "@ui/ambient";
import { Avatar, AvatarStack } from "@ui/avatar";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Card, CardText, CardTitle } from "@ui/card";
import { DeckCard } from "@ui/card-deck";
import { ChoiceMenu } from "@ui/choice-menu";
import { ChoiceList, ChoiceRow } from "@ui/choice-row";
import { cn } from "@ui/cn";
import { CodeSlots, type CodeSlotsStatus } from "@ui/code-slots";
import { useCountUp } from "@ui/count-up";
import { CoverageBar } from "@ui/coverage-bar";
import { EmptyState } from "@ui/empty-state";
import {
  FieldGroup,
  GroupedField,
  GroupedPhoneField,
  GroupedTextArea,
} from "@ui/field-group";
import { FieldRow, rowInputClass, rowPillInputClass } from "@ui/field-row";
import { FloatingAction, floatingButtonClass } from "@ui/floating-action";
import { DockButton, FloatingDock } from "@ui/floating-dock";
import { FocusText } from "@ui/focus-text";
import { IconButton } from "@ui/icon-button";
import { ListGroup, ListRow } from "@ui/list-row";
import { PersonAvatar, PersonList, PersonRow } from "@ui/person-row";
import { PhoneField, type PhoneValue } from "@ui/phone-field";
import { PhoneFrame } from "@ui/phone-frame";
import { ProgressRing } from "@ui/progress-ring";
import { PunchCircle } from "@ui/punch-circle";
import { Segmented } from "@ui/segmented";
import { SettlingCards } from "@ui/settling-cards";
import { Sheet } from "@ui/sheet";
import { SkeletonBones } from "@ui/skeleton";
import { StatusToast } from "@ui/status-toast";
import { Stepper } from "@ui/stepper";
import { Switch } from "@ui/switch";
import { ltrInputClass, TextArea, TextField } from "@ui/text-field";
import { Tile } from "@ui/tile";
import { WeekStrip } from "@ui/week-strip";
import { WordCycle } from "@ui/word-cycle";
import {
  ArrowLeft,
  Bell,
  CalendarDays,
  Fingerprint,
  ListChecks,
  Plus,
  Save,
  Send,
  Users,
} from "lucide-react";
import Link from "next/link";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { direction, type Locale } from "@/i18n/config";
import enMessages from "@/messages/en.json";
import heMessages from "@/messages/he.json";

const ACCENTS = [
  { hex: "#8b2635", key: "burgundy" },
  { hex: "#9000ff", key: "purple" },
  { hex: "#1f6f50", key: "green" },
  { hex: "#1d5fa8", key: "blue" },
  { hex: "#c46b84", key: "dustyPink" },
  { hex: "#e0a800", key: "mustard" },
] as const;

const MESSAGES = { he: heMessages, en: enMessages } as const;
const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

const APPEARANCES = ["system", "light", "dark"] as const;
type Appearance = (typeof APPEARANCES)[number];

const SWATCHES = [
  { token: "bg", cls: "bg-bg" },
  { token: "surface", cls: "bg-surface" },
  { token: "elevated", cls: "bg-elevated" },
  { token: "surface-2", cls: "bg-surface-2" },
  { token: "surface-3", cls: "bg-surface-3" },
  { token: "line", cls: "bg-line" },
  { token: "edge", cls: "bg-edge" },
  { token: "ink", cls: "bg-ink" },
  { token: "ink-2", cls: "bg-ink-2" },
  { token: "ink-3", cls: "bg-ink-3" },
  { token: "accent", cls: "bg-accent" },
  { token: "accent-soft", cls: "bg-accent-soft" },
  { token: "success", cls: "bg-success" },
  { token: "warning", cls: "bg-warning" },
  { token: "danger", cls: "bg-danger" },
] as const;

const SCALE = [
  { cls: "text-4xl font-bold", label: "4xl · 56–108" },
  { cls: "text-3xl font-bold", label: "3xl · 34–52" },
  { cls: "text-2xl font-bold", label: "2xl · 34" },
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

// The gallery switches language on the spot, so it carries both message
// files and gives its subtree its own provider; the rest of the app gets
// its messages from the root layout.
export function Gallery() {
  const [lang, setLang] = useState<Locale>("he");
  return (
    <NextIntlClientProvider locale={lang} messages={MESSAGES[lang]}>
      <GalleryBody lang={lang} onLangChange={setLang} />
    </NextIntlClientProvider>
  );
}

function GalleryBody({
  lang,
  onLangChange,
}: {
  lang: Locale;
  onLangChange: (next: Locale) => void;
}) {
  const t = useTranslations("design");
  const tDays = useTranslations("days");
  const tWeek = useTranslations("app.shifts.week");
  const [week, setWeek] = useState<"this" | "next">("this");
  const [requested, setRequested] = useState<string>(ACCENTS[0].hex);
  const [phone, setPhone] = useState<PhoneValue>({ display: "", e164: null });
  const [day, setDay] = useState("0");
  const [codeStatus, setCodeStatus] = useState<CodeSlotsStatus>("idle");
  const [codeRun, setCodeRun] = useState(0);
  const [total, setTotal] = useState(120);
  const shownTotal = useCountUp(total, "gallery");
  const [appearance, setAppearance] = useState<Appearance>("system");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [needed, setNeeded] = useState("3");
  const [position, setPosition] = useState("waiter");
  const [toastAt, setToastAt] = useState<string | null>(null);
  const [dock, setDock] = useState(false);
  const [switchOn, setSwitchOn] = useState(true);

  const switchLang = (next: Locale) => {
    onLangChange(next);
    setPhone({ display: "", e164: null }); // the fields remount empty in the new language
  };

  const tokens = accentTokens(requested);
  const accent = ACCENTS.find((a) => a.hex === requested);
  const accentName = accent ? t(`accents.${accent.key}`) : requested;

  return (
    <div
      {...accentProps(tokens)}
      className={cn(
        "min-h-dvh bg-bg text-ink",
        appearance !== "system" && `appearance-${appearance}`,
      )}
    >
      <main
        dir={direction(lang)}
        lang={lang}
        className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col gap-8 px-4 py-8"
      >
        <header className="flex flex-col gap-2">
          <span
            dir="ltr"
            className="flex items-center gap-2 self-start font-bold text-md"
          >
            <span
              aria-hidden="true"
              className="size-4 rounded-[5px] bg-brand"
            />
            ConceptApp
          </span>
          <h1 className="font-bold text-2xl">{t("title")}</h1>
          <p className="text-ink-2">{t("intro")}</p>
        </header>

        <Card tone="raised" padding="lg" className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <span className="font-medium text-sm">{t("accent")}</span>
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
                  {t(`accents.${a.key}`)}
                </button>
              ))}
            </div>
            {tokens.adjusted ? (
              <p className="text-ink-2 text-sm">
                {t.rich("adjusted", {
                  from: accentName,
                  to: tokens.accent,
                  ltr: (chunks) => <span dir="ltr">{chunks}</span>,
                })}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <span className="font-medium text-sm">{t("appearance")}</span>
            <div className="flex flex-wrap gap-2">
              {APPEARANCES.map((a) => (
                <Button
                  key={a}
                  variant={appearance === a ? "primary" : "secondary"}
                  aria-pressed={appearance === a}
                  onClick={() => setAppearance(a)}
                >
                  {t(`appearances.${a}`)}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="font-medium text-sm">{t("direction")}</span>
            <div className="flex gap-2">
              <Button
                variant={lang === "he" ? "primary" : "secondary"}
                aria-pressed={lang === "he"}
                onClick={() => switchLang("he")}
              >
                {t("languages.he")}
              </Button>
              <Button
                variant={lang === "en" ? "primary" : "secondary"}
                aria-pressed={lang === "en"}
                onClick={() => switchLang("en")}
              >
                {t("languages.en")}
              </Button>
            </div>
          </div>
        </Card>

        <Section title={t("colors")}>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {SWATCHES.map((s) => (
              <div key={s.token} className="flex flex-col gap-1.5">
                <span
                  className={cn(
                    "h-12 rounded-control border border-line",
                    s.cls,
                  )}
                />
                <span dir="ltr" className="text-start text-ink-2 text-sm">
                  {s.token}
                </span>
              </div>
            ))}
          </div>
        </Section>

        <Section title={t("type")}>
          <Card className="flex flex-col gap-3">
            {SCALE.map((s) => (
              <div
                key={s.label}
                className="flex items-baseline justify-between gap-4"
              >
                <span className={cn(s.cls, "min-w-0")}>{t("sample")}</span>
                <span dir="ltr" className="shrink-0 text-ink-2 text-sm">
                  {s.label}
                </span>
              </div>
            ))}
          </Card>
        </Section>

        <Section title={t("buttons")}>
          <div className="flex flex-wrap gap-2">
            <Button>{t("primary")}</Button>
            <Button variant="secondary">{t("secondary")}</Button>
            <Button variant="ghost">{t("ghost")}</Button>
            <Button variant="danger">{t("danger")}</Button>
            <Button loading>{t("loading")}</Button>
            <Button disabled>{t("disabled")}</Button>
          </div>
          <Button size="lg" className="w-full">
            {t("wide")}
          </Button>
          <div className="flex gap-2">
            <IconButton label={t("add")} icon={<Plus />} variant="secondary" />
            <IconButton label={t("notifications")} icon={<Bell />} />
            <IconButton label={t("back")} icon={<ArrowLeft />} directional />
          </div>
        </Section>

        <Section title={t("fields")}>
          <Card key={lang} padding="lg" className="flex flex-col gap-4">
            <TextField
              label={t("name")}
              placeholder={t("namePh")}
              autoComplete="name"
            />
            <TextField
              label={t("shift")}
              hint={t("shiftHint")}
              defaultValue={t("shiftDefault")}
            />
            <TextField
              label={t("hours")}
              error={t("hoursError")}
              defaultValue="22:00–17:00"
              dir="ltr"
              className={ltrInputClass}
            />
            <TextArea
              label={t("note")}
              hint={t("noteHint")}
              placeholder={t("notePh")}
              rows={3}
            />
            <TextField
              label={t("locked")}
              defaultValue={t("lockedValue")}
              disabled
            />
            <div className="flex flex-col gap-2">
              <PhoneField
                label={t("phone")}
                name="phone"
                onPhoneChange={setPhone}
              />
              <div>
                {phone.e164 ? (
                  <Badge tone="success">
                    {t("phoneValid")} · <span dir="ltr">{phone.e164}</span>
                  </Badge>
                ) : (
                  <Badge>{t("phoneIncomplete")}</Badge>
                )}
              </div>
            </div>
          </Card>
        </Section>

        <Section title={t("cards")}>
          <Card>
            <CardTitle>{t("flat")}</CardTitle>
            <CardText>{t("flatText")}</CardText>
          </Card>
          <Card tone="raised">
            <CardTitle>{t("raised")}</CardTitle>
            <CardText>{t("raisedText")}</CardText>
          </Card>
          <Card tone="accent">
            <CardTitle>{t("accentCard")}</CardTitle>
            <CardText>{t("accentText")}</CardText>
          </Card>
        </Section>

        <Section title={t("rows")}>
          <ListGroup>
            <ListRow
              href="/design"
              leading={t("p1i")}
              title={t("p1")}
              subtitle={t("p1s")}
              trailing={<Badge tone="success">{t("p1b")}</Badge>}
            />
            <ListRow
              onClick={() => {}}
              leading={t("p2i")}
              title={t("p2")}
              subtitle={t("p2s")}
              trailing={<Badge tone="warning">{t("p2b")}</Badge>}
            />
            <ListRow
              title={t("p3")}
              subtitle={t("p3s")}
              trailing={<Badge tone="accent">{t("p3b")}</Badge>}
            />
          </ListGroup>
        </Section>

        <Section title={t("layout")}>
          <Button asChild variant="secondary" className="w-full">
            <Link href="/design/shell">{t("layoutLink")}</Link>
          </Button>
          <WeekStrip
            label={t("week")}
            value={day}
            onChange={setDay}
            days={DAYS.map((key, i) => ({
              key: String(i),
              label: tDays(`${key}.short`),
              date: String(18 + i),
              marked: i === 1 || i === 3,
              markLabel: t("openShift"),
            }))}
          />
          <Segmented
            label={t("week")}
            value={week}
            onChange={setWeek}
            options={[
              { value: "this", label: tWeek("this") },
              { value: "next", label: tWeek("next") },
            ]}
            className="self-start"
          />
        </Section>

        <Section title={t("switchTitle")}>
          <FieldGroup className="md:max-w-md">
            <FieldRow
              label={t("switchLabel")}
              hint={t("switchHint")}
              htmlFor="gallery-switch"
            >
              <Switch
                id="gallery-switch"
                checked={switchOn}
                onChange={setSwitchOn}
              />
            </FieldRow>
          </FieldGroup>
        </Section>

        <Section title={t("depth")}>
          <div>
            <Card
              tone="hero"
              padding="lg"
              className="flex flex-col gap-3 pb-16"
            >
              <span className="font-medium text-base">{t("heroLabel")}</span>
              <span className="font-bold text-2xl">{t("heroTitle")}</span>
            </Card>
            <Card
              tone="float"
              className="relative mx-3 -mt-11 flex items-center gap-3"
            >
              <Avatar name={t("person1")} />
              <span className="min-w-0 flex-1 font-semibold text-base">
                {t("floatText")}
              </span>
            </Card>
          </div>
        </Section>

        <Section title={t("ambient")}>
          <div className="relative isolate h-24 overflow-hidden rounded-card">
            <Ambient />
          </div>
        </Section>

        <Section title={t("people")}>
          <div className="flex items-center gap-4">
            <Avatar name={t("person1")} />
            <Avatar name={t("person2")} />
            <AvatarStack names={[t("person1"), t("person2"), t("person3")]} />
          </div>
        </Section>

        <Section title={t("personRow")}>
          <PersonList>
            <PersonRow
              name={t("person1")}
              title={t("person1")}
              subtitle={t("sheetRole")}
              trailing={<Badge tone="success">{t("success")}</Badge>}
            />
            <PersonRow
              name={null}
              title={t("person2")}
              subtitle={t("sheetRole")}
              below={<Button variant="secondary">{t("emptyAction")}</Button>}
            />
          </PersonList>
        </Section>

        <Section title={t("fieldGroup")}>
          <FieldGroup key={lang}>
            <GroupedField
              label={t("name")}
              placeholder={t("namePh")}
              leading={<PersonAvatar name={t("person1")} />}
            />
            <GroupedField
              label={t("hours")}
              error={t("hoursError")}
              defaultValue="22:00–17:00"
              dir="ltr"
              className={ltrInputClass}
            />
            <GroupedPhoneField label={t("phone")} hint={t("shiftHint")} />
            <GroupedTextArea
              label={t("note")}
              placeholder={t("notePh")}
              rows={2}
            />
          </FieldGroup>
        </Section>

        <Section title={t("choices")}>
          <ChoiceList legend={t("shift")} legendClassName="sr-only">
            <ChoiceRow
              name="galleryChoice"
              defaultChecked
              title={t("p1")}
              hint={t("choiceHint")}
              leading={<CalendarDays />}
            />
            <ChoiceRow
              name="galleryChoice"
              title={t("p2")}
              hint={t("choiceHint")}
              leading={<Users />}
            />
          </ChoiceList>
        </Section>

        <Section title={t("emptyState")}>
          <Card padding="none">
            <EmptyState
              headingLevel="h2"
              icon={<ListChecks />}
              title={t("emptyTitle")}
              body={t("emptyBody")}
            >
              <Button>{t("emptyAction")}</Button>
            </EmptyState>
          </Card>
        </Section>

        <Section title={t("floatingAction")}>
          {/* A transform makes this box hold what is fixed, so the action stays here. */}
          <div className="relative h-36 transform-gpu overflow-hidden rounded-card bg-surface-2">
            <FloatingAction className="bottom-4 md:fixed">
              <Button size="lg" className={cn("w-full", floatingButtonClass)}>
                {t("emptyAction")}
              </Button>
            </FloatingAction>
          </div>
        </Section>

        <Section title={t("punchCircle")}>
          <div className="grid gap-6 md:grid-cols-3">
            <PunchCircle
              tone="off"
              figure={<Fingerprint aria-hidden="true" />}
              label={t("punchIn")}
            />
            <PunchCircle
              tone="live"
              progress={0.45}
              figure={<span dir="ltr">3:42:07</span>}
              label={t("punchOut")}
            />
            <PunchCircle
              tone="paused"
              progress={0.45}
              figure={<span dir="ltr">0:12:30</span>}
              label={t("punchBack")}
            />
          </div>
        </Section>

        <Section title={t("skeleton")}>
          <SkeletonBones />
        </Section>

        <Section title={t("codeSlots")}>
          <Card className="flex flex-col gap-3">
            <CodeSlots
              key={codeRun}
              name="gallery-code"
              label={t("codeSlots")}
              status={codeStatus}
              slotClassName="bg-surface-2 shadow-none"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => setCodeStatus("error")}
              >
                {t("codeWrong")}
              </Button>
              <Button
                variant="secondary"
                onClick={() => setCodeStatus("success")}
              >
                {t("codeRight")}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setCodeStatus("idle");
                  setCodeRun((run) => run + 1);
                }}
              >
                {t("codeAgain")}
              </Button>
            </div>
          </Card>
        </Section>

        <Section title={t("countUp")}>
          <Card className="flex items-center justify-between gap-3">
            <span dir="ltr" className="font-bold text-xl tabular-nums">
              {shownTotal}
            </span>
            <Button
              variant="secondary"
              onClick={() => setTotal((value) => value + 86)}
            >
              {t("countUpAdd")}
            </Button>
          </Card>
        </Section>

        <Section title={t("ring")}>
          <Card className="flex items-center gap-3">
            <ProgressRing value={3} max={4} />
            <span className="font-medium">{t("emptyBody")}</span>
          </Card>
        </Section>

        <Section title={t("tiles")}>
          <div className="grid grid-cols-3 gap-2.5">
            <Tile
              href="/design/shell"
              tone="warning"
              icon={<CalendarDays />}
              value="5"
              label={t("tileGaps")}
            />
            <Tile
              href="/design/shell"
              tone="danger"
              icon={<Users />}
              value="2"
              label={t("tileMissing")}
            />
            <Tile
              href="/design/shell"
              tone="accent"
              icon={<ListChecks />}
              value="1"
              label={t("tileLists")}
            />
          </div>
        </Section>

        <Section title={t("sheet")}>
          <Button variant="secondary" onClick={() => setSheetOpen(true)}>
            {t("sheetOpen")}
          </Button>
          <Sheet
            open={sheetOpen}
            onOpenChange={setSheetOpen}
            title={t("sheetTitle")}
            subtitle={t("sheetSubtitle")}
            closeLabel={t("sheetClose")}
            action={{
              label: t("sheetDone"),
              onClick: () => setSheetOpen(false),
            }}
          >
            <ListGroup className="shadow-none">
              <ListRow
                leading={<Avatar name={t("person1")} />}
                title={t("person1")}
                subtitle={t("sheetRole")}
              />
              <ListRow
                leading={<Avatar name={t("person2")} />}
                title={t("person2")}
                subtitle={t("sheetRole")}
              />
            </ListGroup>
          </Sheet>
        </Section>

        <Section title={t("groupedForm")}>
          <ListGroup>
            <FieldRow label={t("name")} htmlFor="gallery-row-name">
              <input
                id="gallery-row-name"
                placeholder={t("namePh")}
                className={rowInputClass}
              />
            </FieldRow>
            <FieldRow label={t("startTime")} htmlFor="gallery-row-time">
              <input
                id="gallery-row-time"
                type="time"
                dir="ltr"
                defaultValue="09:00"
                className={rowPillInputClass}
              />
            </FieldRow>
            <FieldRow label={t("peopleNeeded")} htmlFor="gallery-row-needed">
              <Stepper
                id="gallery-row-needed"
                value={needed}
                onValueChange={setNeeded}
                min={1}
                max={50}
                decreaseLabel={t("fewer")}
                increaseLabel={t("more")}
              />
            </FieldRow>
            <ListRow
              leading={<Avatar name={t("person1")} />}
              title={t("person1")}
              subtitle={
                <ChoiceMenu
                  label={t("positionLabel", {
                    value:
                      position === "host" ? t("positionHost") : t("sheetRole"),
                  })}
                  value={position}
                  options={[
                    { key: "waiter", label: t("sheetRole") },
                    { key: "host", label: t("positionHost") },
                  ]}
                  onChange={setPosition}
                  className="-my-3"
                />
              }
            />
          </ListGroup>
        </Section>

        <Section title={t("coverage")}>
          <Card className="flex flex-col gap-3">
            <CoverageBar filled={2} total={3} />
            <CoverageBar filled={3} total={3} />
            <CoverageBar filled={9} total={20} />
          </Card>
        </Section>

        <Section title={t("floating")}>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => setToastAt(new Date().toISOString())}
            >
              {t("toastShow")}
            </Button>
            <Button
              variant="secondary"
              aria-pressed={dock}
              onClick={() => setDock(!dock)}
            >
              {dock ? t("dockHide") : t("dockShow")}
            </Button>
          </div>
          <StatusToast
            message={toastAt ? t("toastText") : null}
            stamp={toastAt ?? undefined}
          />
          {dock ? (
            <FloatingDock>
              <DockButton tone="quiet" icon={<Save aria-hidden="true" />}>
                {t("dockQuiet")}
              </DockButton>
              <DockButton
                icon={<Send aria-hidden="true" className="rtl:-scale-x-100" />}
              >
                {t("dockMain")}
              </DockButton>
            </FloatingDock>
          ) : null}
        </Section>

        <Section title={t("badges")}>
          <div className="flex flex-wrap gap-2">
            <Badge>{t("neutral")}</Badge>
            <Badge tone="accent">{t("accentB")}</Badge>
            <Badge tone="success">{t("success")}</Badge>
            <Badge tone="warning">{t("warning")}</Badge>
            <Badge tone="danger">{t("dangerB")}</Badge>
          </div>
        </Section>

        <Section title={t("grainFocus")}>
          <Card tone="hero" padding="lg" className="grain relative">
            <p className="font-bold text-3xl">
              <FocusText text={t("motionTitle")} />
            </p>
          </Card>
        </Section>

        <Section title={t("wordCycle")}>
          <p className="font-bold text-3xl">
            <span className="block text-ink-2">{t("cycleLead")}</span>
            <WordCycle words={[t("cycle1"), t("cycle2"), t("cycle3")]} />
          </p>
        </Section>

        <Section title={t("phoneFrame")}>
          <PhoneFrame
            label={t("phoneLabel")}
            className="mx-auto w-full max-w-[240px]"
          >
            <p className="px-4 py-16 text-center font-semibold">
              {t("phoneText")}
            </p>
          </PhoneFrame>
        </Section>

        <Section title={t("deck")}>
          <div className="flex flex-col gap-4">
            <DeckCard index={0} className="flex flex-col gap-1.5">
              <h3 className="font-bold text-2xl">{t("deckCard1")}</h3>
              <p className="min-h-40 text-ink-2">{t("deckBody")}</p>
            </DeckCard>
            <DeckCard index={1} className="flex flex-col gap-1.5">
              <h3 className="font-bold text-2xl">{t("deckCard2")}</h3>
              <p className="min-h-40 text-ink-2">{t("deckBody")}</p>
            </DeckCard>
          </div>
        </Section>

        <Section title={t("settling")}>
          <SettlingCards
            head={<p className="font-bold text-xl">{t("settleTitle")}</p>}
            items={[
              { key: "q1", question: t("settleQ1"), answer: t("settleA1") },
              { key: "q2", question: t("settleQ2"), answer: t("settleA2") },
            ]}
          />
        </Section>
      </main>
    </div>
  );
}
