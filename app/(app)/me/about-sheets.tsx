"use client";

import {
  type AddressForm,
  BIO_MAX,
  bioLength,
  type CoverPreset,
  normalizeBio,
  type ProfileFailure,
  type ProfileSaveResult,
} from "@domain/profile";
import { parseTeamName, TEAM_NAME_MAX, unchangedTeamName } from "@domain/team";
import { Button } from "@ui/button";
import { ChoiceList, ChoiceRow } from "@ui/choice-row";
import { CoverChoices } from "@ui/cover-choices";
import { FieldGroup, GroupedField } from "@ui/field-group";
import { Sheet } from "@ui/sheet";
import { TextArea } from "@ui/text-field";
import { ChevronDown, Info, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { type FormEvent, type ReactNode, useRef, useState } from "react";

/** The words a failed profile change shows, in `app.me.failures`. */
export function failureKey(
  failure: ProfileFailure,
): "demo" | "invalid" | "viewOnly" | "notYet" | "failed" {
  switch (failure) {
    case "demo":
    case "viewOnly":
    case "notYet":
      return failure;
    case "empty":
    case "invalid":
    case "bioTooLong":
    case "nameRequired":
    case "nameTooLong":
      return "invalid";
    default:
      return "failed";
  }
}

/** A save that never throws: a lost connection is a failure like any other. */
export const settle = (run: Promise<ProfileSaveResult>) =>
  run.catch(() => ({ ok: false, failure: "failed" }) as const);

/**
 * "Why" one tap away, with no script: a 44px summary with an info mark, and
 * the answer in a soft card under it.
 */
export function WhyDetails({
  summary,
  children,
}: {
  summary: string;
  children: ReactNode;
}) {
  return (
    <details className="group">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 self-start rounded-full font-medium text-base text-ink-2 focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
        <Info aria-hidden="true" className="size-4 shrink-0" />
        {summary}
        <ChevronDown
          aria-hidden="true"
          className="size-4 shrink-0 transition-transform duration-200 group-open:rotate-180"
        />
      </summary>
      <p className="mt-1 text-pretty rounded-card bg-surface-2 p-4 text-sm">
        {children}
      </p>
    </details>
  );
}

function Failure({ failure }: { failure: ProfileFailure | null }) {
  const t = useTranslations("app.me.failures");
  return failure ? (
    <p role="alert" className="text-center text-base text-danger">
      {t(failureKey(failure))}
    </p>
  ) : null;
}

type SheetBase = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Changing their own name ("השם שלי"), as the team keeps a name: one line of
 * up to 80 characters, never none, with the field's words of the business's
 * own editor. Where the business keeps a name of its own for them (`kept`),
 * even one that is their own name now, the note says that one stays; only
 * the business changes it.
 */
export function NameSheet({
  open,
  onOpenChange,
  name,
  kept,
  business,
  onSave,
}: SheetBase & {
  /** Their own name as saved; null for none. */
  name: string | null;
  /** The name the business keeps for them (`public.member_names`), or null. */
  kept: string | null;
  business: string;
  onSave: (name: string) => Promise<ProfileSaveResult>;
}) {
  const t = useTranslations("app.me");
  const tp = useTranslations("ui.photoPicker");
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("name.row")}
      closeLabel={tp("close")}
    >
      {/* The sheet's body mounts on each opening, so it starts from the saved name. */}
      <NameForm
        name={name}
        kept={kept}
        business={business}
        onSave={onSave}
        onDone={() => onOpenChange(false)}
      />
    </Sheet>
  );
}

function NameForm({
  name,
  kept,
  business,
  onSave,
  onDone,
}: {
  name: string | null;
  kept: string | null;
  business: string;
  onSave: (name: string) => Promise<ProfileSaveResult>;
  onDone: () => void;
}) {
  const t = useTranslations("app.me");
  const tInvite = useTranslations("app.team.invite");
  const field = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(name ?? "");
  const [error, setError] = useState<"required" | "tooLong" | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ProfileFailure | null>(null);
  const parsed = parseTeamName(draft);
  // One saved with a double space, or with its letters decomposed, is no
  // change until a letter really differs; one saved with what nobody sees
  // (a direction mark, a zero-width space) is, and saving it cleans it.
  const same = unchangedTeamName(draft, name);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!parsed.ok) {
      // Said as an alert wherever the focus was, then the field takes it, to
      // write the name at once.
      setError(parsed.error);
      field.current?.focus();
      return;
    }
    setBusy(true);
    setFailure(null);
    const result = await settle(onSave(parsed.name));
    if (result.ok) {
      onDone();
      return;
    }
    setBusy(false);
    setFailure(result.failure);
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="flex flex-col gap-4 px-2 pt-2 pb-1"
    >
      <FieldGroup className="bg-elevated">
        <GroupedField
          ref={field}
          name="own-name"
          label={tInvite("name")}
          placeholder={tInvite("namePlaceholder")}
          // Their own name, which the device may offer.
          autoComplete="name"
          enterKeyHint="done"
          maxLength={TEAM_NAME_MAX}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(null);
            setFailure(null);
          }}
          error={
            error ? (
              <span role="alert">{tInvite(`errors.name.${error}`)}</span>
            ) : undefined
          }
          required
        />
      </FieldGroup>
      <p className="px-2 text-pretty text-base text-ink-2">
        {/* Even one that is their own name now stays after they save. */}
        {kept ? t("name.noteKept", { business, name: kept }) : t("name.note")}
      </p>
      <Failure failure={failure} />
      <Button
        type="submit"
        size="lg"
        loading={busy}
        disabled={same || busy}
        className="w-full"
      >
        {t("name.save")}
      </Button>
    </form>
  );
}

/**
 * Writing the line about yourself: up to 160 characters, counted as they are
 * kept. With a line there, it can also be deleted at once; the screen then
 * offers it back.
 */
export function BioSheet({
  open,
  onOpenChange,
  bio,
  onSave,
  onRemove,
}: SheetBase & {
  bio: string | null;
  onSave: (text: string) => Promise<ProfileSaveResult>;
  onRemove: () => Promise<ProfileSaveResult>;
}) {
  const t = useTranslations("app.me");
  const tp = useTranslations("ui.photoPicker");
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("bio.row")}
      closeLabel={tp("close")}
    >
      {/* The sheet's body mounts on each opening, so it starts from the saved line. */}
      <BioForm
        bio={bio}
        onSave={onSave}
        onRemove={onRemove}
        onDone={() => onOpenChange(false)}
      />
    </Sheet>
  );
}

function BioForm({
  bio,
  onSave,
  onRemove,
  onDone,
}: {
  bio: string | null;
  onSave: (text: string) => Promise<ProfileSaveResult>;
  onRemove: () => Promise<ProfileSaveResult>;
  onDone: () => void;
}) {
  const t = useTranslations("app.me");
  const [text, setText] = useState(bio ?? "");
  const [busy, setBusy] = useState<"save" | "remove" | null>(null);
  const [failure, setFailure] = useState<ProfileFailure | null>(null);
  const count = bioLength(normalizeBio(text));
  const tooLong = count > BIO_MAX;
  const countLine = t("bio.count", { count });

  async function run(
    kind: "save" | "remove",
    write: () => Promise<ProfileSaveResult>,
  ) {
    setBusy(kind);
    setFailure(null);
    const result = await settle(write());
    if (result.ok) {
      onDone();
      return;
    }
    setBusy(null);
    setFailure(result.failure);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || tooLong) return;
    // Saving an empty line is deleting it, with the same way back.
    if (!normalizeBio(text)) {
      if (bio) void run("remove", onRemove);
      else onDone();
      return;
    }
    void run("save", () => onSave(text));
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 px-2 pt-2 pb-1">
      <TextArea
        label={t("bio.label")}
        placeholder={t("bio.placeholder")}
        rows={3}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setFailure(null);
        }}
        hint={countLine}
        error={
          tooLong ? (
            <>
              {countLine}
              <span className="block">{t("bio.tooLong")}</span>
            </>
          ) : undefined
        }
      />
      <Failure failure={failure === "bioTooLong" ? null : failure} />
      <div className="flex flex-col gap-2">
        <Button
          type="submit"
          size="lg"
          loading={busy === "save"}
          disabled={busy !== null}
          className="w-full"
        >
          {t("bio.save")}
        </Button>
        {bio ? (
          <Button
            variant="ghost"
            loading={busy === "remove"}
            disabled={busy !== null}
            onClick={() => void run("remove", onRemove)}
            className="w-full text-danger"
          >
            {busy === "remove" ? null : <Trash2 aria-hidden="true" />}
            {t("bio.remove")}
          </Button>
        ) : null}
      </div>
    </form>
  );
}

/**
 * Choosing a cover: the eight presets in the business's colour. The page's
 * own cover behind the sheet shows the one picked (`onDraft`) before it is
 * saved, as the approved prototype does.
 */
export function CoverSheet({
  open,
  onOpenChange,
  business,
  hue,
  draft,
  onDraft,
  onSave,
}: SheetBase & {
  business: string;
  hue: number;
  draft: CoverPreset | null;
  onDraft: (preset: CoverPreset) => void;
  onSave: (preset: CoverPreset) => Promise<ProfileSaveResult>;
}) {
  const t = useTranslations("app.me");
  const tp = useTranslations("ui.photoPicker");
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("cover.sheetTitle")}
      subtitle={t("cover.sheetSubtitle", { business })}
      closeLabel={tp("close")}
    >
      <CoverForm
        hue={hue}
        draft={draft}
        onDraft={onDraft}
        onSave={onSave}
        onDone={() => onOpenChange(false)}
      />
    </Sheet>
  );
}

function CoverForm({
  hue,
  draft,
  onDraft,
  onSave,
  onDone,
}: {
  hue: number;
  draft: CoverPreset | null;
  onDraft: (preset: CoverPreset) => void;
  onSave: (preset: CoverPreset) => Promise<ProfileSaveResult>;
  onDone: () => void;
}) {
  const t = useTranslations("app.me");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ProfileFailure | null>(null);

  async function save() {
    if (!draft || busy) return;
    setBusy(true);
    setFailure(null);
    const result = await settle(onSave(draft));
    if (result.ok) {
      onDone();
      return;
    }
    setBusy(false);
    setFailure(result.failure);
  }

  return (
    <div className="flex flex-col gap-4 px-2 pt-2 pb-1">
      <CoverChoices
        legend={t("cover.sheetTitle")}
        value={draft}
        onChange={(preset) => {
          onDraft(preset);
          setFailure(null);
        }}
        hue={hue}
      />
      <p className="px-4 text-balance text-center text-ink-2 text-sm">
        {t("cover.note")}
      </p>
      <Failure failure={failure} />
      <Button
        size="lg"
        loading={busy}
        disabled={!draft}
        onClick={save}
        className="w-full"
      >
        {t("cover.save")}
      </Button>
    </div>
  );
}

/**
 * How the app addresses the person and writes about them: feminine,
 * masculine or without gender, each with examples in their own name. Nothing
 * is chosen until they choose; why it is asked is one tap away.
 */
export function FormSheet({
  open,
  onOpenChange,
  form,
  firstName,
  onSave,
}: SheetBase & {
  form: AddressForm | null;
  /** For the examples: "נועה מוסרת משמרת". */
  firstName: string;
  onSave: (form: AddressForm) => Promise<ProfileSaveResult>;
}) {
  const t = useTranslations("app.me");
  const tp = useTranslations("ui.photoPicker");
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("form.sheetTitle")}
      closeLabel={tp("close")}
    >
      <AddressFormChoice
        form={form}
        firstName={firstName}
        onSave={onSave}
        onDone={() => onOpenChange(false)}
      />
    </Sheet>
  );
}

const FORMS = ["f", "m", "x"] as const satisfies readonly AddressForm[];

function AddressFormChoice({
  form,
  firstName,
  onSave,
  onDone,
}: {
  form: AddressForm | null;
  firstName: string;
  onSave: (form: AddressForm) => Promise<ProfileSaveResult>;
  onDone: () => void;
}) {
  const t = useTranslations("app.me");
  const [draft, setDraft] = useState(form);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ProfileFailure | null>(null);

  async function save() {
    if (!draft || busy) return;
    setBusy(true);
    setFailure(null);
    const result = await settle(onSave(draft));
    if (result.ok) {
      onDone();
      return;
    }
    setBusy(false);
    setFailure(result.failure);
  }

  return (
    <div className="flex flex-col gap-4 px-2 pt-2 pb-1">
      <p className="px-2 text-center text-base text-ink-2">{t("form.lead")}</p>
      <ChoiceList legend={t("form.sheetTitle")} legendClassName="sr-only">
        {FORMS.map((choice) => (
          <ChoiceRow
            key={choice}
            name="address-form"
            value={choice}
            checked={draft === choice}
            onChange={() => {
              setDraft(choice);
              setFailure(null);
            }}
            title={t(`form.${choice}`)}
            hint={t(`form.${choice}Hint`, { name: firstName })}
          />
        ))}
      </ChoiceList>
      <div className="px-1">
        <WhyDetails summary={t("form.why")}>{t("form.whyText")}</WhyDetails>
      </div>
      <p className="px-4 text-balance text-center text-ink-2 text-sm">
        {t("form.note")}
      </p>
      <Failure failure={failure} />
      <Button
        size="lg"
        loading={busy}
        disabled={!draft}
        onClick={save}
        className="w-full"
      >
        {t("form.save")}
      </Button>
    </div>
  );
}
