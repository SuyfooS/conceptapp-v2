import { defineManifest } from "@domain/modules";
import { z } from "zod";

/**
 * Chat (Orel, 8 November 2026, issue #1): the whole team's group, a group for
 * each department, and a private chat between any two people on the staff. A
 * private chat is read by its two people and nobody else: not the owner, not a
 * manager, not the ConceptApp team, not a view session. In groups, management
 * posts announcements that ask for "קראתי" and removes messages, with undo.
 * Accountants are off the staff and in no chat. The database holds it all
 * (supabase/migrations/20261111000200_chat.sql); the screens came with C2,
 * which switched the module on in every template, a version up each, and in
 * every business where its tab fits (20261111000300_chat_on.sql): the fourth
 * module tab, beside the schedule, the clock and lists, so the tab bar is
 * full (modules/templates.db.test.ts checks every template still fits).
 *
 * The tab is the fifth with Home, after Lists (order 28, ahead of
 * reservations' 30, so `moduleNav`'s cut keeps chat). An accountant's
 * documents tab (`outsideStaff`) comes with the documents' screens (C7):
 * until then an accountant has no chat tab and no documents tab.
 *
 * Official documents (C6, 20261111000700_documents.sql; @domain/documents)
 * are on wherever chat is (private.documents_on), so they can become a module
 * of their own by changing that one function: a worker's to the business,
 * read by them and the office (clock.payroll), and the business's to people.
 */
export const manifest = defineManifest({
  key: "chat",
  requires: [],
  nav: { href: "/chat", icon: "chat", minRole: "worker", order: 28 },
  homeWidget: { minRole: "worker" },
  permissions: [
    // Post announcements in groups. public.send_chat_message asks
    // private.holds_perm, which holds the same default.
    { key: "chat.announce", defaultRole: "manager" },
    // Be in every department's group, read all of it, and remove others'
    // messages in groups (private.chat_moderates).
    { key: "chat.moderate", defaultRole: "manager" },
    // Send official documents to people (C6; pay holders send them too).
    { key: "chat.send_documents", defaultRole: "manager" },
  ],
  settings: z.object({
    /**
     * Who writes in the whole team's group: everyone, or management only
     * (announcers, the holders of chat.announce). Orel's default (§17,
     * question 5): everyone. Owners and managers set it on /manage.
     */
    teamGroupWho: z.enum(["everyone", "announcers"]).default("everyone"),
    /**
     * Days a chat file is kept (C4; Orel: 90); the message stays and says its
     * file is no longer kept. For the ConceptApp team only, since storage is
     * what could cost, as lists' photoDays. public.expired_files counts only
     * these three (CHAT_FILE_DAYS in @domain/chat-files), anything else as 90;
     * private.chat_settings holds the same default.
     */
    fileDays: z
      .union([z.literal(30), z.literal(90), z.literal(180)])
      .default(90)
      .meta({ level: "team" }),
    /**
     * A business's space for chat files, in MB (C4): past it, its oldest
     * files go first, even before their days are up (Orel, 11 November 2026);
     * official documents never go for space. The team's, as public.
     * expired_files reads it (CHAT_FILE_SPACE_MB, anything else as 100).
     */
    fileSpaceMb: z
      .union([z.literal(50), z.literal(100), z.literal(200)])
      .default(100)
      .meta({ level: "team" }),
    /**
     * A business's space for official documents, in MB (C6): past it, new
     * ones are refused (54000 with hint 'space'), and none is ever deleted
     * for space. The team's. private.document_space_bytes counts only these
     * three (DOCUMENT_SPACE_MB in @domain/documents), anything else as 50;
     * private.chat_settings holds the same default.
     */
    documentSpaceMb: z
      .union([z.literal(50), z.literal(100), z.literal(200)])
      .default(50)
      .meta({ level: "team" }),
  }),
});
