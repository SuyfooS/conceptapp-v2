/**
 * A new id for a draft line or a round's key, and for a row the twin makes
 * (a line, a ticket, a takeaway). An
 * address that isn't https (a phone on the office's network, reaching the
 * dev server by its IP) has no `crypto.randomUUID`, and the twin is for
 * exactly that phone: a version 4 id by hand there, as the chat's composer
 * does.
 */
export function newId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
