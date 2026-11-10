"use client";

import { WEEKDAY_KEYS } from "@domain/availability-form";
import { accentTokens } from "@domain/color";
import { avatarHue } from "@domain/people";
import { COVER_PRESETS, type CoverPreset } from "@domain/profile";
import { punchPayload, spokenDigits } from "@domain/punch-code-format";
import { type DateParts, EMPTY_DATE, parseTypedDate } from "@domain/typed-date";
import { accentProps } from "@ui/accent";
import { AccentPicker, AccentPreview } from "@ui/accent-picker";
import { Ambient } from "@ui/ambient";
import { Avatar, AvatarStack } from "@ui/avatar";
import { AvatarPhotoPicker } from "@ui/avatar-photo-picker";
import { Badge } from "@ui/badge";
import {
  type BusinessChoice,
  BusinessList,
  BusinessMark,
  BusinessMenu,
  BusinessSwitchRow,
} from "@ui/business-switcher";
import { Button } from "@ui/button";
import { Card, CardText, CardTitle } from "@ui/card";
import { ChecklistItem } from "@ui/checklist-item";
import { ChoiceMenu } from "@ui/choice-menu";
import { ChoiceList, ChoiceRow } from "@ui/choice-row";
import { cn } from "@ui/cn";
import { CodeDisplay } from "@ui/code-display";
import { CodeSlots, type CodeSlotsStatus } from "@ui/code-slots";
import { useCountUp } from "@ui/count-up";
import { CoverChoices } from "@ui/cover-choices";
import { CoverageBar } from "@ui/coverage-bar";
import { DataTable } from "@ui/data-table";
import { DateField } from "@ui/date-field";
import { DayToggles } from "@ui/day-toggles";
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
import { IconButton } from "@ui/icon-button";
import { ListGroup, ListRow } from "@ui/list-row";
import { Logo, LogoMark } from "@ui/logo";
import { PersonAvatar, PersonList, PersonRow } from "@ui/person-row";
import { PhoneField, type PhoneValue } from "@ui/phone-field";
import { ProfileCover } from "@ui/profile-cover";
import { ProgressRing } from "@ui/progress-ring";
import { PunchCircle } from "@ui/punch-circle";
import { QrCode } from "@ui/qr-code";
import { ScanCircle } from "@ui/scan-circle";
import { Segmented } from "@ui/segmented";
import { Sheet } from "@ui/sheet";
import { SkeletonBones } from "@ui/skeleton";
import { StatusToast } from "@ui/status-toast";
import { Stepper } from "@ui/stepper";
import { Switch } from "@ui/switch";
import { ltrInputClass, TextArea, TextField } from "@ui/text-field";
import { Tile } from "@ui/tile";
import { VisibilityNote } from "@ui/visibility-note";
import { WeekStrip } from "@ui/week-strip";
import {
  ArrowLeft,
  Bell,
  CalendarDays,
  Check,
  Fingerprint,
  ListChecks,
  Plus,
  Save,
  ScanQrCode,
  Send,
  Users,
} from "lucide-react";
import Link from "next/link";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { direction, type Locale } from "@/i18n/config";
import enMessages from "@/messages/en.json";
import heMessages from "@/messages/he.json";
import { portraits } from "./portraits";

const ACCENTS = [
  { hex: "#8b2635", key: "burgundy" },
  { hex: "#9000ff", key: "purple" },
  { hex: "#1f6f50", key: "green" },
  { hex: "#1d5fa8", key: "blue" },
  { hex: "#c46b84", key: "dustyPink" },
  { hex: "#e0a800", key: "mustard" },
] as const;

const MESSAGES = { he: heMessages, en: enMessages } as const;
/** The picker's stand-in save: a moment's wait, and nothing stored. */
const pause = () => new Promise((resolve) => setTimeout(resolve, 600));
/** A fixed clock code, so the gallery's QR is the same on every visit. */
const GALLERY_QR = punchPayload("c0nceptApp-gallery-qr1");
const GALLERY_DIGITS = "482915";
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
  const tCode = useTranslations("app.clock.code");
  const tClock = useTranslations("app.clock");
  const tMe = useTranslations("app.me");
  const tNav = useTranslations("app.nav");
  const tCover = useTranslations("ui.profileCover");
  const tList = useTranslations("app.lists.list");
  const tTimes = useTranslations("app.lists.schedules");
  const tPay = useTranslations("app.pay");
  const tRoles = useTranslations("app.roles");
  const [ticked, setTicked] = useState(false);
  const [ordered, setOrdered] = useState(true);
  const [givenCount, setGivenCount] = useState("20");
  const [fridge, setFridge] = useState("7");
  const [freezer, setFreezer] = useState("18");
  const [below, setBelow] = useState(true);
  const [missing, setMissing] = useState("");
  const [week, setWeek] = useState<"this" | "next">("this");
  const [requested, setRequested] = useState<string>(ACCENTS[0].hex);
  const [phone, setPhone] = useState<PhoneValue>({ display: "", e164: null });
  const [birth, setBirth] = useState<DateParts>(EMPTY_DATE);
  const typedBirth = parseTypedDate(birth);
  const [day, setDay] = useState("0");
  const [galleryDays, setGalleryDays] = useState([0, 1, 2, 3, 4]);
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
  const [picked, setPicked] = useState("#4f46e5");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [galleryPhoto, setGalleryPhoto] = useState<string | null>(
    portraits.maya,
  );
  const [galleryCover, setGalleryCover] = useState<CoverPreset>("waves");

  const switchLang = (next: Locale) => {
    onLangChange(next);
    setPhone({ display: "", e164: null }); // the fields remount empty in the new language
    setBirth(EMPTY_DATE);
  };

  // One login in two businesses (payroll P3b), switched with a stand-in that
  // only waits a moment.
  const galleryBusinesses: BusinessChoice[] = [
    {
      id: "shop",
      name: t("switcherShop"),
      accent: ACCENTS[1].hex,
      role: tRoles("owner"),
      unread: 2,
      current: true,
    },
    {
      id: "bakery",
      name: t("switcherBakery"),
      accent: ACCENTS[2].hex,
      role: tRoles("accountant"),
      unread: 1,
      current: false,
    },
  ];
  const galleryChoose = async (_form: FormData) => {
    await pause();
  };

  const tokens = accentTokens(requested);
  const accent = ACCENTS.find((a) => a.hex === requested);
  const accentName = accent ? t(`accents.${accent.key}`) : requested;

  // What the camera would see: a code held up, a little turned.
  const scanStill = (
    <div className="grid size-full place-items-center bg-surface-3">
      <QrCode
        value={GALLERY_QR}
        label={tCode("qrLabel")}
        className="w-[46%] -rotate-6"
      />
    </div>
  );
  const scanCancel = { label: tClock("scan.cancel"), onClick: () => {} };

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
          <Logo label={t("brand")} className="self-start" />
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

        <Section title={t("logo")}>
          <Card className="flex flex-col gap-5">
            <Logo label={t("brand")} className="h-12 self-start" />
            <div className="flex items-end gap-4">
              <LogoMark className="h-12" />
              <LogoMark className="h-8" />
              <LogoMark className="h-5" />
            </div>
            <p className="text-ink-2 text-sm">{t("logoText")}</p>
          </Card>
        </Section>

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
            <IconButton
              label={t("notifications")}
              icon={<Bell />}
              href="/design/shell/notifications"
              badge={{ count: 3, label: t("notificationsNew", { count: 3 }) }}
            />
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
            <div className="flex flex-col gap-2">
              <DateField
                label={t("dateField")}
                parts={{
                  day: tPay("dateParts.day"),
                  month: tPay("dateParts.month"),
                  year: tPay("dateParts.year"),
                }}
                value={birth}
                onChange={setBirth}
                hint={t("dateFieldHint")}
              />
              <div>
                {typedBirth.ok ? (
                  <Badge tone="success">
                    {t("dateFieldValid")} ·{" "}
                    <span dir="ltr">{typedBirth.date}</span>
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
            <ListRow
              onClick={() => {}}
              current
              title={t("rowCurrent")}
              subtitle={t("rowCurrentText")}
            />
            <ListRow
              onClick={() => {}}
              disabled
              title={t("rowDisabled")}
              subtitle={t("rowDisabledText")}
            />
          </ListGroup>
        </Section>

        <Section title={t("switcher")}>
          <p className="text-ink-2 text-sm">{t("switcherText")}</p>
          <BusinessList businesses={galleryBusinesses} action={galleryChoose} />
          <BusinessSwitchRow
            businesses={galleryBusinesses}
            action={galleryChoose}
          />
          {/* As the sidebar draws it: the same mark, and the name as a menu
              with what is unread in the other business under it. */}
          <Card className="flex items-center gap-3">
            <BusinessMark
              name={galleryBusinesses[0]?.name ?? ""}
              accent={galleryBusinesses[0]?.accent ?? ACCENTS[1].hex}
            />
            <BusinessMenu
              businesses={galleryBusinesses}
              action={galleryChoose}
            />
          </Card>
        </Section>

        <Section title={t("dataTable")}>
          <GalleryTable />
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

        <Section title={t("accentPickerTitle")}>
          <AccentPreview
            accent={picked}
            caption={t("accentPickerCaption")}
            title={t("heroTitle")}
            button={t("accentPickerButton")}
          />
          <AccentPicker
            value={picked}
            kept="#4f46e5"
            label={t("accentPickerTitle")}
            name="gallery-accent"
            onPick={(hex) => setPicked(hex)}
          />
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
            <AvatarStack
              people={[
                { name: t("person1") },
                { name: t("person2") },
                { name: t("person3") },
              ]}
            />
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

        <Section title={t("photos")}>
          <p className="text-ink-2">{t("photosText")}</p>
          <div className="flex flex-wrap items-center gap-4">
            <Avatar name={t("person1")} photo={portraits.maya} size="xl" />
            <Avatar name={t("person2")} size="xl" />
            <Avatar name={t("person1")} photo={portraits.shiran} />
            <Avatar name={t("person2")} />
            <Avatar name={t("person3")} photo={portraits.yoav} size="sm" />
            <PersonAvatar name={null} photo={portraits.yoav} />
            <AvatarStack
              people={[
                { name: t("person1"), photo: portraits.maya },
                { name: t("person2") },
                { name: t("person3"), photo: portraits.yoav },
              ]}
            />
          </div>
          <PersonList>
            <PersonRow
              name={t("person1")}
              photo={portraits.shiran}
              title={t("person1")}
              subtitle={t("sheetRole")}
            />
          </PersonList>
        </Section>

        <Section title={t("photoPicker")}>
          <div className="flex items-center gap-4">
            <Avatar name={t("person1")} photo={galleryPhoto} size="xl" />
            <Button variant="secondary" onClick={() => setPickerOpen(true)}>
              {t("photoPickerOpen")}
            </Button>
          </div>
          <AvatarPhotoPicker
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            name={t("person1")}
            photo={galleryPhoto}
            onSave={async (blob) => {
              await pause();
              const photo = URL.createObjectURL(blob);
              setGalleryPhoto(photo);
              return { ok: true, photo };
            }}
            onRemove={async () => {
              await pause();
              setGalleryPhoto(null);
              return { ok: true, photo: null };
            }}
          />
        </Section>

        <Section title={t("visibility")}>
          <VisibilityNote>{tMe("about.visible")}</VisibilityNote>
          <VisibilityNote icon="lock">{t("visibilityPrivate")}</VisibilityNote>
        </Section>

        <Section title={t("cover")}>
          <p className="text-ink-2">{t("covers")}</p>
          <ProfileCover
            preset={galleryCover}
            hue={avatarHue(t("person1"))}
            className="h-36 rounded-card"
          >
            <span className="absolute start-3 top-3 flex min-h-11 items-center rounded-full bg-accent-press ps-4 pe-4 font-semibold text-accent-ink text-base">
              {tNav("home")}
            </span>
          </ProfileCover>
          <div className="grid grid-cols-2 gap-3">
            {COVER_PRESETS.map((preset) => (
              <figure key={preset} className="m-0 flex flex-col gap-1.5">
                <ProfileCover
                  preset={preset}
                  hue={avatarHue(t("person1"))}
                  className="aspect-[2.55] rounded-control"
                />
                <figcaption className="text-center text-ink-2 text-sm">
                  {tCover(`presets.${preset}`)}
                </figcaption>
              </figure>
            ))}
          </div>
          <CoverChoices
            legend={t("cover")}
            value={galleryCover}
            onChange={setGalleryCover}
            hue={avatarHue(t("person1"))}
          />
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

        <Section title={t("dayToggles")}>
          <DayToggles
            legend={tTimes("sheet.days")}
            value={galleryDays}
            onChange={setGalleryDays}
            days={WEEKDAY_KEYS.map((key) => ({
              short: tDays(`${key}.short`),
              long: tTimes(`dayNames.${key}`),
            }))}
          />
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

        <Section title={t("checklist")}>
          <ListGroup>
            <ChecklistItem
              kind="check"
              label={t("checklistCheck")}
              required
              optionalLabel={tList("optional")}
              done={ticked}
              doneLine={tList.rich("doneBy", {
                name: t("checklistWho"),
                time: "07:42",
                ltr: (chunks) => <span dir="ltr">{chunks}</span>,
              })}
              check={{ checked: ticked, onToggle: () => setTicked(!ticked) }}
              commentAction={{ label: tList("comment.add"), onClick: () => {} }}
            />
            {/* An order's check: ticked, how many were given, and how many short. */}
            <ChecklistItem
              kind="check"
              label={t("checklistOrder")}
              hint={tList("requested", { count: 24 })}
              required
              optionalLabel={tList("optional")}
              done={ordered}
              check={{
                checked: ordered,
                onToggle: () => {
                  setOrdered(!ordered);
                  setGivenCount("24");
                },
              }}
              quantity={{
                label: tList("givenLabel"),
                value: givenCount,
                onValueChange: setGivenCount,
                onCommit: () => {},
                fieldLabel: tList("givenOf", { label: t("checklistOrder") }),
                decreaseLabel: tList("fewer", { label: t("checklistOrder") }),
                increaseLabel: tList("more", { label: t("checklistOrder") }),
                max: 9999,
                short:
                  Number(givenCount) < 24
                    ? tList("short", { count: 24 - Number(givenCount) })
                    : null,
              }}
            />
            {/* The same, only read: the count in words. */}
            <ChecklistItem
              kind="check"
              label={t("checklistOrder")}
              hint={tList("requested", { count: 24 })}
              required
              optionalLabel={tList("optional")}
              done
              readOnly
              quantity={{
                label: tList("givenLabel"),
                value: "20",
                onValueChange: () => {},
                onCommit: () => {},
                fieldLabel: tList("givenOf", { label: t("checklistOrder") }),
                decreaseLabel: tList("fewer", { label: t("checklistOrder") }),
                increaseLabel: tList("more", { label: t("checklistOrder") }),
                max: 9999,
                text: tList("given", { given: 20, requested: 24 }),
              }}
            />
            <ChecklistItem
              kind="number"
              label={t("checklistNumber")}
              required
              optionalLabel={tList("optional")}
              done={fridge.trim() !== ""}
              number={{
                value: fridge,
                onValueChange: setFridge,
                onCommit: () => {},
                fieldLabel: tList("readingOf", { label: t("checklistNumber") }),
                unit: "°C",
                range: tList.rich("range.between", {
                  range: "0–5 °C",
                  ltr: (chunks) => <span dir="ltr">{chunks}</span>,
                }),
                outOfRange:
                  Number(fridge) > 5 || Number(fridge) < 0
                    ? tList.rich("outOfRange", {
                        range: "0–5 °C",
                        ltr: (chunks) => <span dir="ltr">{chunks}</span>,
                      })
                    : null,
              }}
            />
            <ChecklistItem
              kind="number"
              label={t("checklistFreezer")}
              required
              optionalLabel={tList("optional")}
              done={false}
              number={{
                value: freezer,
                onValueChange: setFreezer,
                onCommit: () => {},
                fieldLabel: tList("readingOf", {
                  label: t("checklistFreezer"),
                }),
                unit: "°C",
                range: tList.rich("range.between", {
                  range: "-25–-18 °C",
                  ltr: (chunks) => <span dir="ltr">{chunks}</span>,
                }),
                minus: {
                  label: tList("minus"),
                  on: below,
                  onToggle: () => setBelow(!below),
                },
              }}
            />
            <ChecklistItem
              kind="note"
              label={t("checklistNote")}
              required={false}
              optionalLabel={tList("optional")}
              done={missing.trim() !== ""}
              note={{
                value: missing,
                onValueChange: setMissing,
                onCommit: () => {},
                fieldLabel: t("checklistNote"),
                placeholder: tList("answerPlaceholder"),
              }}
            />
            <ChecklistItem
              kind="photo"
              label={t("checklistPhoto")}
              required={false}
              optionalLabel={tList("optional")}
              done={false}
              photo={{ text: tList("photoLater") }}
            />
            <ChecklistItem
              kind="check"
              label={t("checklistCheck")}
              required
              optionalLabel={tList("optional")}
              done
              readOnly
              comment={t("checklistNote")}
              doneLine={tList.rich("doneBy", {
                name: t("checklistWho"),
                time: "07:42",
                ltr: (chunks) => <span dir="ltr">{chunks}</span>,
              })}
            />
            {/* Read-only below zero: no minus toggle, the value has its sign. */}
            <ChecklistItem
              kind="number"
              label={t("checklistFreezer")}
              required
              optionalLabel={tList("optional")}
              done
              readOnly
              doneLine={tList.rich("doneBy", {
                name: t("checklistWho"),
                time: "07:44",
                ltr: (chunks) => <span dir="ltr">{chunks}</span>,
              })}
              number={{
                value: "-19",
                onValueChange: () => {},
                onCommit: () => {},
                fieldLabel: tList("readingOf", {
                  label: t("checklistFreezer"),
                }),
                unit: "°C",
                range: tList.rich("range.between", {
                  range: "-25–-18 °C",
                  ltr: (chunks) => <span dir="ltr">{chunks}</span>,
                }),
              }}
            />
          </ListGroup>
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

        <Section title={t("qrCode")}>
          <Card className="flex flex-col items-center gap-4 bg-qr-paper text-qr-ink sm:flex-row sm:justify-center sm:gap-8">
            <QrCode
              value={GALLERY_QR}
              label={tCode("qrLabel")}
              className="w-44 shrink-0"
            />
            <div className="flex flex-col items-center gap-1">
              <span className="font-medium text-qr-ink/70 text-sm">
                {tCode("digitsLabel")}
              </span>
              <CodeDisplay
                digits={GALLERY_DIGITS}
                spoken={tCode("digitsSpoken", {
                  digits: spokenDigits(GALLERY_DIGITS),
                })}
              />
              <span className="flex min-h-7 items-center gap-2 text-qr-ink/70 text-sm">
                {/* The ring on the paper keeps its light colours in dark mode. */}
                <ProgressRing
                  value={12}
                  max={20}
                  tone="paper"
                  className="size-6"
                />
                {tCode("next", { seconds: 12 })}
              </span>
            </div>
          </Card>
          <p className="text-ink-2 text-sm">{t("qrCodeText")}</p>
        </Section>

        <Section title={t("scanCircle")}>
          <div className="grid gap-6 md:grid-cols-2">
            <PunchCircle
              tone="off"
              figure={<ScanQrCode aria-hidden="true" />}
              label={tClock("circle.scanIn")}
            />
            <ScanCircle
              state="starting"
              still={scanStill}
              status={tClock("scan.starting")}
              cancel={scanCancel}
            />
            <ScanCircle
              state="aiming"
              still={scanStill}
              status={tClock("scan.aim")}
              cancel={scanCancel}
            />
            <ScanCircle
              state="reading"
              still={scanStill}
              status={tClock("scan.sending")}
              cancel={{ ...scanCancel, disabled: true }}
            />
            <ScanCircle
              state="read"
              still={scanStill}
              figure={
                <>
                  <Check aria-hidden="true" />
                  <span dir="ltr">08:04</span>
                </>
              }
              status={tClock("scan.readIn")}
              cancel={{ ...scanCancel, disabled: true }}
            />
            <ScanCircle
              state="problem"
              still={scanStill}
              status={tClock("scan.denied")}
              cancel={scanCancel}
            />
          </div>
          <p className="text-ink-2 text-sm">{t("scanCircleText")}</p>
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
      </main>
    </div>
  );
}

/** A table one chooses rows of, in a flat card: numbers read left to right. */
function GalleryTable() {
  const t = useTranslations("design");
  const [chosen, setChosen] = useState<string | null>(null);
  const people = [
    { key: "p1", name: t("person1"), days: 21, hours: "168.50", waiting: 0 },
    { key: "p2", name: t("person2"), days: 18, hours: "142.25", waiting: 2 },
    { key: "p3", name: t("person3"), days: 9, hours: "61.00", waiting: 0 },
  ];
  return (
    <div className="flex flex-col gap-2">
      <Card padding="none" className="overflow-hidden">
        <DataTable
          caption={t("dataTable")}
          columns={[
            { key: "name", label: t("dataTableName") },
            {
              key: "days",
              label: t("dataTableDays"),
              align: "end",
              numeric: true,
            },
            {
              key: "hours",
              label: t("dataTableHours"),
              align: "end",
              numeric: true,
            },
            {
              key: "waiting",
              label: t("dataTableWaiting"),
              align: "end",
              numeric: true,
            },
          ]}
          rows={people.map((person) => ({
            key: person.key,
            label: t("dataTableOpen", { name: person.name }),
            cells: {
              name: person.name,
              days: person.days,
              hours: person.hours,
              waiting: person.waiting,
            },
          }))}
          selected={chosen}
          onSelect={setChosen}
        />
      </Card>
      <p className="px-1 text-ink-2 text-sm">
        {chosen
          ? t("dataTableChosen", {
              name: people.find((person) => person.key === chosen)?.name ?? "",
            })
          : t("dataTableHint")}
      </p>
      <GalleryReadTable />
    </div>
  );
}

/**
 * A table that only reads, wide enough to scroll sideways on a phone: with
 * no row to choose, the keyboard reaches its scroller (Tab, then the arrows).
 */
function GalleryReadTable() {
  const t = useTranslations("design");
  const days = [
    {
      key: "d1",
      date: "1.10",
      in: "09:00",
      out: "17:30",
      regular: "8.00",
      ot125: "0.50",
      ot150: "0.00",
      note: t("dataTableNote1"),
    },
    {
      key: "d2",
      date: "2.10",
      in: "22:00",
      out: "06:30",
      regular: "7.00",
      ot125: "1.50",
      ot150: "0.00",
      note: t("dataTableNote2"),
    },
    {
      key: "d3",
      date: "6.10",
      in: "08:00",
      out: "18:00",
      regular: "7.00",
      ot125: "2.00",
      ot150: "1.00",
      note: t("dataTableNote3"),
    },
  ];
  const number = (key: string, label: string) => ({
    key,
    label,
    align: "end" as const,
    numeric: true,
  });
  return (
    <div className="mt-4 flex flex-col gap-2">
      <Card padding="none" className="overflow-hidden">
        <DataTable
          caption={t("dataTableRead")}
          columns={[
            { key: "date", label: t("dataTableDate"), numeric: true },
            { key: "in", label: t("dataTableIn"), numeric: true },
            { key: "out", label: t("dataTableOut"), numeric: true },
            number("regular", t("dataTableRegular")),
            number("ot125", t("dataTableOt125")),
            number("ot150", t("dataTableOt150")),
            { key: "note", label: t("dataTableNote") },
          ]}
          rows={days.map((day) => ({
            key: day.key,
            cells: {
              date: day.date,
              in: day.in,
              out: day.out,
              regular: day.regular,
              ot125: day.ot125,
              ot150: day.ot150,
              note: day.note,
            },
          }))}
        />
      </Card>
      <p className="px-1 text-ink-2 text-sm">{t("dataTableReadHint")}</p>
    </div>
  );
}
