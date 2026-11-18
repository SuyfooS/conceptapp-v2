"use client";

import type { DocumentRemoveReason } from "@domain/documents";
import { useState } from "react";
import { DocumentScreen } from "../../../(app)/chat/documents/[id]/document-screen";
import type {
  DocumentPageData,
  DocumentSendData,
  DocumentsScreenData,
} from "../../../(app)/chat/documents/document-screen-types";
import { DocumentsScreen } from "../../../(app)/chat/documents/documents-screen";
import { SendDocumentForm } from "../../../(app)/chat/documents/send/send-form";

/*
 * The documents' real screens on the demo's mock rows (chat C7), with
 * stand-ins for their writes that store nothing: what is pressed changes the
 * screen as the database's answer would, after a moment.
 */

const DOCUMENTS_DEMO_BASE = "/design/chat/documents";

const wait = () => new Promise((resolve) => setTimeout(resolve, 400));
const done = { ok: true as const, value: null };

/** The list, whose notice's "הבנתי" stores nothing. */
export function DemoDocuments({ data }: { data: DocumentsScreenData }) {
  return (
    <DocumentsScreen
      data={data}
      base={DOCUMENTS_DEMO_BASE}
      seeNotice={async () => {
        await wait();
        return done;
      }}
    />
  );
}

/**
 * A document's page: "קראתי ואישרתי", removing its file and putting it back
 * change it here as the database would, and nothing is stored.
 */
export function DemoDocument({
  data,
  justSent,
  openRemoval,
}: {
  data: DocumentPageData;
  justSent: boolean;
  openRemoval: boolean;
}) {
  const [shown, setShown] = useState(data);
  const me = data.reader.id;
  return (
    <DocumentScreen
      data={shown}
      base={DOCUMENTS_DEMO_BASE}
      justSent={justSent}
      openRemoval={openRemoval}
      actions={{
        confirm: async () => {
          await wait();
          const now = new Date().toISOString();
          setShown((page) => ({
            ...page,
            document: {
              ...page.document,
              recipients: page.document.recipients.map((r) =>
                r.personId === me
                  ? {
                      ...r,
                      openedAt: r.openedAt ?? now,
                      confirmedAt: r.confirmedAt ?? now,
                    }
                  : r,
              ),
            },
          }));
          return done;
        },
        remove: async (_document: string, reason: DocumentRemoveReason) => {
          await wait();
          const now = Date.now();
          setShown((page) => ({
            ...page,
            removable: [],
            restorable: true,
            document: {
              ...page.document,
              removedAt: new Date(now).toISOString(),
              removedBy: me,
              removedReason: reason,
              fileGoneAfter: new Date(now + 10 * 60_000).toISOString(),
            },
          }));
          return done;
        },
        restore: async () => {
          await wait();
          setShown((page) => ({
            ...page,
            removable: data.removable,
            restorable: false,
            document: {
              ...page.document,
              removedAt: null,
              removedBy: null,
              removedReason: null,
              fileGoneAfter: null,
            },
          }));
          return done;
        },
      }}
    />
  );
}

/**
 * The send screen: a photo or a sample goes to the demo's sick note or
 * payslip page as if sent; a PDF is a demo business's own answer, since the
 * demo has no Storage to put it in.
 */
export function DemoSend({
  data,
  initial,
}: {
  data: DocumentSendData;
  initial: "from_person" | "to_people";
}) {
  const sent = (direction: "from_person" | "to_people") => ({
    ok: true as const,
    value: {
      document: direction === "from_person" ? "sick-note" : "procedure",
    },
  });
  return (
    <SendDocumentForm
      data={data}
      base={DOCUMENTS_DEMO_BASE}
      initial={initial}
      actions={{
        photo: async (form) => {
          await wait();
          const meta = form.get("document");
          const direction =
            typeof meta === "string" && meta.includes('"to_people"')
              ? "to_people"
              : "from_person";
          return sent(direction);
        },
        startPdf: async () => {
          await wait();
          return { ok: false, failure: "demo" };
        },
        finishPdf: async () => ({ ok: false, failure: "demo" }),
        cancelPdf: async () => ({
          ok: true,
          value: { sent: false, document: null },
        }),
        sample: async (input) => {
          await wait();
          return sent(input.direction);
        },
      }}
    />
  );
}
