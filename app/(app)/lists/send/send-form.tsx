"use client";

import type { SendInput } from "@domain/lists";
import type { StaffRole } from "@domain/modules";
import { Avatar } from "@ui/avatar";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { ChoiceList, ChoiceRow } from "@ui/choice-row";
import { FloatingAction, floatingButtonClass } from "@ui/floating-action";
import { PageBody, PageHeader } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { Segmented } from "@ui/segmented";
import { TextArea } from "@ui/text-field";
import {
  Building2,
  CircleCheck,
  Hash,
  NotebookPen,
  Send,
  UserRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import type {
  ListFailure,
  SendFormData,
  SendResult,
  SendTemplate,
} from "../list-types";

type Kind = "person" | "department" | "role";

const KIND_ICONS: Record<string, typeof CircleCheck> = {
  check: CircleCheck,
  number: Hash,
  note: NotebookPen,
};

/** Where a template sends itself when nobody chooses. */
function defaultsOf(template: SendTemplate | undefined): {
  kind: Kind;
  department: string | null;
  role: StaffRole | null;
} {
  const recipient = template?.recipient;
  if (recipient?.kind === "department") {
    return { kind: "department", department: recipient.department, role: null };
  }
  if (recipient?.kind === "role") {
    return { kind: "role", department: null, role: recipient.role };
  }
  return { kind: "person", department: null, role: null };
}

/**
 * Sending a list now: which list, to whom, and a note. Whoever sends lists
 * picks a person, a department or a role; a department's members send their
 * own order, which goes where the order goes. The main action names where it
 * goes ("send to the kitchen"). Phone: the form. Tablet and desktop: the form
 * beside the list as it will arrive. Also on /design/shell/lists/send.
 */
export function SendForm({
  data,
  send,
  paths,
}: {
  data: SendFormData;
  send: (input: SendInput) => Promise<SendResult>;
  paths: { lists: string };
}) {
  const t = useTranslations("app.lists.send");
  const router = useRouter();
  const [templateId, setTemplateId] = useState(data.initial);
  const template = data.templates.find((x) => x.id === templateId);
  const start = defaultsOf(template);
  const [kind, setKind] = useState<Kind>(start.kind);
  const [person, setPerson] = useState<string | null>(null);
  const [department, setDepartment] = useState<string | null>(start.department);
  const [role, setRole] = useState<StaffRole | null>(start.role);
  const [note, setNote] = useState("");
  const [failure, setFailure] = useState<ListFailure | null>(null);
  const [pending, startSend] = useTransition();

  // An order goes where the order goes, for whoever may only send orders.
  const fixed =
    !data.free && template?.recipient?.kind === "department"
      ? template.recipient.department
      : null;

  function choose(id: string) {
    setTemplateId(id);
    setFailure(null);
    const next = defaultsOf(data.templates.find((x) => x.id === id));
    setKind(next.kind);
    setDepartment(next.department);
    setRole(next.role);
  }

  const departmentName = (id: string | null) =>
    data.departments.find((d) => d.id === id)?.name ?? null;
  const personName = (id: string | null) =>
    data.people.find((p) => p.userId === id)?.name ?? t("noName");

  const recipient: SendInput["recipient"] | null = fixed
    ? { kind: "department", department: fixed }
    : kind === "person" && person
      ? { kind: "person", user: person }
      : kind === "department" && department
        ? { kind: "department", department }
        : kind === "role" && role
          ? { kind: "role", role }
          : null;

  const submitLabel = !recipient
    ? t("choose")
    : recipient.kind === "person"
      ? t("submit.person", { name: personName(recipient.user) })
      : recipient.kind === "department"
        ? t("submit.department", {
            name: departmentName(recipient.department) ?? "",
          })
        : recipient.kind === "role"
          ? t("submit.role", { role: recipient.role })
          : t("choose");

  function submit() {
    if (!template || !recipient) return;
    setFailure(null);
    const text = note.trim();
    startSend(async () => {
      let result: SendResult;
      try {
        result = await send({
          template: template.id,
          recipient,
          ...(text ? { note: text } : {}),
        });
      } catch {
        result = { ok: false, failure: "failed" };
      }
      if (!result.ok) {
        setFailure(result.failure);
        return;
      }
      router.push(`${paths.lists}?sent=${result.value}`);
    });
  }

  return (
    <PageBody className={pageGlowClass}>
      <PageHeader
        back={{ href: paths.lists, label: t("back") }}
        title={t("title")}
        subtitle={t("subtitle")}
      />
      <div className="grid items-start gap-8 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-8">
          <ChoiceList legend={t("which")}>
            {data.templates.map((x) => (
              <ChoiceRow
                key={x.id}
                name="template"
                value={x.id}
                checked={x.id === templateId}
                onChange={() => choose(x.id)}
                title={x.name}
                hint={t("items", { count: x.items.length })}
              />
            ))}
          </ChoiceList>

          {fixed ? (
            <section className="flex flex-col gap-3">
              <h2 className="px-1 font-bold text-lg">{t("to")}</h2>
              <Card tone="flat" padding="lg">
                {t("fixedTo", { name: departmentName(fixed) ?? "" })}
              </Card>
            </section>
          ) : (
            <section className="flex flex-col gap-3">
              <h2 className="px-1 font-bold text-lg">{t("to")}</h2>
              <Segmented
                label={t("to")}
                value={kind}
                onChange={(next) => {
                  setKind(next);
                  setFailure(null);
                }}
                options={(["person", "department", "role"] as const).map(
                  (value) => ({ value, label: t(`kinds.${value}`) }),
                )}
              />
              {kind === "person" ? (
                <ChoiceList
                  legend={t("kinds.person")}
                  legendClassName="sr-only"
                >
                  {data.people.map((p) => (
                    <ChoiceRow
                      key={p.userId}
                      name="person"
                      value={p.userId}
                      checked={person === p.userId}
                      onChange={() => setPerson(p.userId)}
                      title={p.name ?? t("noName")}
                      leading={
                        p.name ? (
                          <Avatar name={p.name} photo={p.photo} />
                        ) : (
                          <UserRound />
                        )
                      }
                    />
                  ))}
                </ChoiceList>
              ) : kind === "department" ? (
                data.departments.length > 0 ? (
                  <ChoiceList
                    legend={t("kinds.department")}
                    legendClassName="sr-only"
                  >
                    {data.departments.map((d) => (
                      <ChoiceRow
                        key={d.id}
                        name="department"
                        value={d.id}
                        checked={department === d.id}
                        onChange={() => setDepartment(d.id)}
                        title={d.name}
                        leading={<Building2 />}
                      />
                    ))}
                  </ChoiceList>
                ) : (
                  <p className="px-1 text-ink-2">{t("noDepartments")}</p>
                )
              ) : (
                <ChoiceList legend={t("kinds.role")} legendClassName="sr-only">
                  {data.roles.map((r) => (
                    <ChoiceRow
                      key={r}
                      name="role"
                      value={r}
                      checked={role === r}
                      onChange={() => setRole(r)}
                      title={t(`roles.${r}`)}
                    />
                  ))}
                </ChoiceList>
              )}
            </section>
          )}

          <TextArea
            label={t("note")}
            hint={t("noteHint")}
            value={note}
            maxLength={300}
            rows={3}
            onChange={(event) => setNote(event.target.value)}
          />

          {failure ? (
            <p role="alert" className="px-1 font-medium text-danger">
              {t(`failed.${failure}`)}
            </p>
          ) : null}

          <FloatingAction>
            <Button
              size="lg"
              loading={pending}
              disabled={!recipient}
              onClick={submit}
              className={`w-full md:w-auto ${floatingButtonClass}`}
            >
              <Send aria-hidden="true" />
              {submitLabel}
            </Button>
          </FloatingAction>
        </div>

        {template ? (
          <aside
            aria-label={t("preview")}
            className="hidden min-w-0 flex-col gap-3 md:flex"
          >
            <h2 className="px-1 font-bold text-lg">{t("preview")}</h2>
            <Card tone="flat" padding="lg" className="flex flex-col gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="font-semibold text-md">{template.name}</span>
                <span className="text-ink-2 text-sm">
                  {t("items", { count: template.items.length })}
                </span>
              </div>
              {template.note || note.trim() ? (
                <p className="whitespace-pre-line text-base text-ink-2">
                  {[template.note, note.trim()].filter(Boolean).join("\n")}
                </p>
              ) : null}
              <ul className="flex flex-col gap-2.5">
                {template.items.map((item, index) => {
                  const Icon = KIND_ICONS[item.kind] ?? CircleCheck;
                  return (
                    <li
                      // Items have no id here, and their order never changes.
                      // biome-ignore lint/suspicious/noArrayIndexKey: see above
                      key={index}
                      className="flex items-center gap-2.5 text-base"
                    >
                      <Icon
                        aria-hidden="true"
                        className="size-5 shrink-0 text-ink-2"
                      />
                      <span className="min-w-0">{item.label}</span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </aside>
        ) : null}
      </div>
    </PageBody>
  );
}
