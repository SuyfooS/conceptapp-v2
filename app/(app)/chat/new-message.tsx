"use client";

import { Button } from "@ui/button";
import { PersonList, PersonRow } from "@ui/person-row";
import { Sheet } from "@ui/sheet";
import { TextField } from "@ui/text-field";
import { VisibilityNote } from "@ui/visibility-note";
import { SquarePen } from "lucide-react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { CHAT_OPENER, focusLost, screenTitle } from "./chat-focus";
import { chatPaths } from "./chat-paths";
import { useChat } from "./chat-provider";

/**
 * The chat list's main action: a sheet of everyone else on the staff, with a
 * search by name. Choosing someone opens their private chat with the reader,
 * or a new one that the first message makes, and closes the sheet, the chat
 * already open beside it too. In a demo business it says that whoever comes
 * in reads it, not that only the two of them do. Closed with the chat on
 * screen chosen again, it gives the keyboard's focus to that chat's title;
 * closed with another chosen, to its button, marked (`CHAT_OPENER`) so the
 * chosen chat takes it from there as it opens, whatever is drawn beside the
 * list meanwhile (the chat being left, or a loading skeleton); closed with
 * no one chosen, back to its button.
 */
export function NewMessage({ quiet }: { quiet: boolean }) {
  const t = useTranslations("app.chat");
  const chat = useChat();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const button = useRef<HTMLButtonElement>(null);
  /**
   * Who was chosen: the chat already on screen ("again", no address
   * changes), or another, which the sheet closes onto.
   */
  const chose = useRef<"again" | "other" | null>(null);

  // The sheet lives beside every chat screen: a chat chosen from it closes it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the address is what closes it
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const existing = new Map(
    chat.rows.flatMap((row) =>
      row.kind === "direct" && row.otherPerson
        ? [[row.otherPerson, row.conversation] as const]
        : [],
    ),
  );
  const wanted = query.trim().toLocaleLowerCase();
  const shown = wanted
    ? chat.contacts.filter((c) =>
        (c.name ?? "").toLocaleLowerCase().includes(wanted),
      )
    : chat.contacts;

  return (
    <>
      <Button
        ref={button}
        variant={quiet ? "secondary" : "primary"}
        onClick={() => {
          chose.current = null;
          setQuery("");
          setOpen(true);
        }}
        // Moved on from, or taken by the chat that opened: no longer what
        // opens it.
        onBlur={(event) => event.currentTarget.removeAttribute(CHAT_OPENER)}
      >
        <SquarePen aria-hidden="true" />
        {t("list.newMessage")}
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={t("list.newMessage")}
        closeLabel={t("newMessage.close")}
        returnFocus={() => {
          const toChat = chose.current;
          chose.current = null;
          // Only the chat on screen is the one chosen: anything else beside
          // the list now is the chat being left, or its skeleton.
          const title = toChat === "again" ? screenTitle() : null;
          if (title) return title;
          // The chosen chat isn't drawn yet, and nothing took the focus as
          // the sheet closed: the button holds it until the chat opens.
          if (toChat && focusLost()) {
            button.current?.setAttribute(CHAT_OPENER, "");
          }
          return button.current;
        }}
      >
        <div className="flex flex-col gap-3 px-2 pb-2">
          <VisibilityNote icon={chat.demo ? "eye" : "lock"}>
            {chat.demo ? t("list.demoNote") : t("newMessage.hint")}
          </VisibilityNote>
          <TextField
            label={t("newMessage.search")}
            type="search"
            autoComplete="off"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {shown.length > 0 ? (
            <PersonList className="bg-elevated shadow-none">
              {shown.map((contact) => {
                const conversation = existing.get(contact.id);
                const href = conversation
                  ? chatPaths.conversation(conversation)
                  : chatPaths.withPerson(contact.id);
                return (
                  <PersonRow
                    key={contact.id}
                    name={contact.name}
                    photo={contact.photo}
                    title={contact.name ?? t("list.noName")}
                    subtitle={contact.line}
                    href={href}
                    // The chat on screen chosen again changes no address.
                    onClick={() => {
                      chose.current = href === pathname ? "again" : "other";
                      setOpen(false);
                    }}
                  />
                );
              })}
            </PersonList>
          ) : (
            <p className="px-2 py-6 text-center text-ink-2">
              {chat.contacts.length > 0
                ? t("newMessage.none")
                : t("newMessage.nobody")}
            </p>
          )}
        </div>
      </Sheet>
    </>
  );
}
