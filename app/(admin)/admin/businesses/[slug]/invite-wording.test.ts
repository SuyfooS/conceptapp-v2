import { isolateName } from "@domain/bidi";
import { shareText } from "@domain/share";
import type { Wording } from "@domain/wording";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The console's invites go out in the business's own sentence, as /team
// sends them (closing the pilot, PR 4, after review): a business or its
// template may reword `app.team.pending.message`, and the console, which has
// no business's WordingProvider, reads those sentences for the screens that
// make a link. Only the words the link goes out with: the console's own stay
// the app's.

vi.mock("server-only", () => ({}));
const { getWordingForTeam } = vi.hoisted(() => ({
  getWordingForTeam: vi.fn(),
}));
vi.mock("@db/wording", () => ({ getWordingForTeam }));

const { inviteShareWording } = await import("./invite-wording");
const { WordingProvider } = await import("@/app/(app)/wording-provider");
const { InviteShare } = await import("@/app/invite-share");
const { NextIntlClientProvider, createTranslator } = await import("next-intl");
const he = (await import("@/messages/he.json")).default;

const heT = createTranslator({ locale: "he", messages: he });

const BUSINESS_ID = "00000000-0000-4000-b000-0000000000f1";
const BUSINESS = "המרפאה של מיכל";
const LINK =
  "https://app.example/join/AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCd";
const MESSAGE = "app.team.pending.message";
// A sentence a clinic's team might write, its {business} kept.
const CLINIC =
  "הוזמנת לצוות של {business} באפליקציית ConceptApp. הקישור אישי ובתוקף 14 יום.";
const TEMPLATE = "{business} מזמינים אותך לצוות. הקישור בתוקף 14 יום.";

type Row = { key: string; sentence: string };
const row = ({ key, sentence }: Row) => ({
  key,
  sentence,
  baseSentence: "",
  updatedAt: "2026-11-28T08:00:00Z",
});

function stored(template: Row[], business: Row[]) {
  getWordingForTeam.mockResolvedValue({
    templateKey: "retail",
    template: template.map(row),
    business: business.map(row),
  });
}

/** The WhatsApp text of an invite's link, drawn under the console's words. */
function sentText(overrides: Wording, words: "team" | "owner" = "team") {
  const html = renderToString(
    createElement(
      NextIntlClientProvider,
      {
        locale: "he",
        timeZone: "Asia/Jerusalem",
        messages: he,
      } as unknown as Parameters<typeof NextIntlClientProvider>[0],
      createElement(
        WordingProvider,
        // Its child goes in as createElement's own argument.
        { overrides } as Parameters<typeof WordingProvider>[0],
        createElement(InviteShare, {
          link: LINK,
          phone: "+972500000911",
          name: "תמר",
          share: { business: BUSINESS, toNumber: true },
          words,
          copy: {
            label: heT("admin.setup.invite.linkFor", { name: "תמר" }),
            hint: he.admin.setup.invite.hint,
            copy: he.admin.setup.invite.copy,
            copied: he.admin.setup.invite.copied,
            failed: he.admin.setup.invite.copyFailed,
          },
        }),
      ),
    ),
  );
  const href = /href="(https:\/\/wa\.me\/[^"]*)"/.exec(html)?.[1] ?? "";
  return new URL(href.replaceAll("&amp;", "&")).searchParams.get("text");
}

beforeEach(() => {
  getWordingForTeam.mockReset();
});

describe("the console's words for an invite's link", () => {
  it("are the business's own sentence, over its template's, read for that business", async () => {
    stored(
      [{ key: MESSAGE, sentence: TEMPLATE }],
      [{ key: MESSAGE, sentence: CLINIC }],
    );
    expect(await inviteShareWording(BUSINESS_ID)).toEqual({
      [MESSAGE]: CLINIC,
    });
    expect(getWordingForTeam).toHaveBeenCalledWith(BUSINESS_ID);
  });

  it("are its template's where the business has none", async () => {
    stored([{ key: MESSAGE, sentence: TEMPLATE }], []);
    expect(await inviteShareWording(BUSINESS_ID)).toEqual({
      [MESSAGE]: TEMPLATE,
    });
  });

  it("leave the console's own words the app's", async () => {
    stored(
      [{ key: "app.team.invite.title", sentence: "צירוף לצוות" }],
      [
        { key: "app.roles.worker", sentence: "מטפל/ת" },
        { key: MESSAGE, sentence: CLINIC },
      ],
    );
    expect(await inviteShareWording(BUSINESS_ID)).toEqual({
      [MESSAGE]: CLINIC,
    });
  });

  it("drop a sentence that no longer fits the app's, so the app's goes out", async () => {
    stored([], [{ key: MESSAGE, sentence: "הוזמנת לצוות." }]);
    expect(await inviteShareWording(BUSINESS_ID)).toEqual({});
  });

  it("put the business's sentence in the WhatsApp the console's link opens", async () => {
    stored([], [{ key: MESSAGE, sentence: CLINIC }]);
    const overrides = await inviteShareWording(BUSINESS_ID);
    const named = { business: isolateName(BUSINESS) };
    const clinic = createTranslator({
      locale: "he",
      messages: { m: CLINIC },
    });
    expect(sentText(overrides)).toBe(shareText(clinic("m", named), LINK));
    // With none, the app's own sentence, as before.
    expect(sentText({})).toBe(
      shareText(heT("app.team.pending.message", named), LINK),
    );
    // An owner's first link keeps the owner's sentence, which nobody rewords.
    expect(sentText(overrides, "owner")).toBe(
      shareText(heT("admin.setup.invite.ownerMessage", named), LINK),
    );
  });
});
