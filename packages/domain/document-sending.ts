import { z } from "zod";
import { isUuid } from "./activity";
import {
  DOCUMENT_CATEGORY_KEYS,
  DOCUMENT_DIRECTIONS,
  DOCUMENT_RECIPIENTS_MAX,
  DOCUMENT_REMOVE_REASONS,
} from "./documents";

/*
 * What the documents' screens send their server actions (chat C7,
 * app/(app)/chat/documents/actions.ts), read with these at the boundary. The
 * database checks every rule again (public.send_document and the rest); these
 * only keep out what is no document at all, and the long text that would
 * otherwise reach it.
 */

const id = z
  .string()
  .refine(isUuid)
  .transform((value) => value.toLowerCase());

const direction = z.enum(DOCUMENT_DIRECTIONS);
const category = z.enum(DOCUMENT_CATEGORY_KEYS);
/** To people: whom, as the screen resolved a person, a department or everyone. */
const to = z.array(id).min(1).max(DOCUMENT_RECIPIENTS_MAX);

/**
 * A document as the send screen fills it in: which way, its category, its
 * title and note as typed (cleaned and checked by @db/documents and again by
 * the database; ignored in a demo business, whose titles are the category's
 * words and which takes no note), and to people whom and whether to ask for
 * "קראתי". To the business it names nobody: it goes to the office.
 */
export const documentSendInput = z.strictObject({
  direction,
  category,
  title: z.string().max(1000),
  note: z.string().max(4000).nullable().optional(),
  to: to.optional(),
  asks: z.boolean().optional(),
});
export type DocumentSendInput = z.input<typeof documentSendInput>;

/**
 * A demo business's document (plan §13): no file, no title and no note, only
 * the sample of its category.
 */
export const documentSampleInput = z.strictObject({
  direction,
  category,
  to: to.optional(),
  asks: z.boolean().optional(),
});
export type DocumentSampleInput = z.input<typeof documentSampleInput>;

/**
 * A PDF about to go up through its signed upload (`startDocumentPdfAction`):
 * which way it goes (who may send it), and its name and size as the browser
 * has them.
 */
export const documentPdfStartInput = z.strictObject({
  direction,
  name: z.string().max(1000),
  size: z.int().min(0),
});
export type DocumentPdfStartInput = z.input<typeof documentPdfStartInput>;

/**
 * The PDF the browser put at its place (`finishDocumentPdfAction`): the place
 * `startDocumentPdfAction` gave, and the document it goes with.
 */
export const documentPdfFinishInput = documentSendInput.extend({ upload: id });
export type DocumentPdfFinishInput = z.input<typeof documentPdfFinishInput>;

/** A PDF the person stopped sending (`cancelDocumentPdfAction`): its place. */
export const documentPdfCancelInput = z.strictObject({ upload: id });
export type DocumentPdfCancelInput = z.input<typeof documentPdfCancelInput>;

/** One document, by its id. */
export const documentIdInput = id;

/** Why a document's file is removed: one of the database's own reasons. */
export const documentRemoveReasonInput = z.enum(DOCUMENT_REMOVE_REASONS);
