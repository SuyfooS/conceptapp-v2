import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { FileCardData } from "./person-view";

// A person's hiring file on their profile (profile H6a): the card's words
// for a holder (what is missing, an account to look at, "פתיחת התיק") and
// for anyone else who sees the team (how many, who sees the details, no way
// into the file), the link to send only when it may be sent and never
// naming what is missing, a quiet row once complete; and the card drawn
// with every word there.

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}));

const { NextIntlClientProvider, createFormatter, createTranslator } =
  await import("next-intl");
const { fileCardWords } = await import("./person-view");
const { FileCard } = await import("./file-card");
const { teamFileStatusFor } = await import("../../../design/shell/data");
const { baseWording, translator } = await import("../../wording");
const he = (await import("@/messages/he.json")).default;

const t = translator(baseWording, "app");
const heT = createTranslator({ locale: "he", messages: he });
const format = createFormatter({ locale: "he", timeZone: "UTC" });
const groups = Object.values(he.app.team.file.groups);

const card = (
  person: string,
  reader: "holder" | "team",
  over: Partial<FileCardData> = {},
): FileCardData => {
  const status = teamFileStatusFor(reader)[person];
  if (!status) throw new Error(person);
  return {
    status,
    reader,
    viewing: false,
    fileHref: reader === "holder" ? `/team/${person}/file` : null,
    share: true,
    businessName: "מסעדת הדגמה",
    form101: true,
    ...over,
  };
};

describe("the file's card on a profile", () => {
  it("names what is missing to a holder, and opens the file", () => {
    const words = fileCardWords(
      t,
      format,
      card("yoav", "holder"),
      "יואב לוי",
      "יואב",
      "m",
    );
    expect(words).toMatchObject({
      title: heT("app.team.file.card.title", { name: "יואב לוי" }),
      lines: [
        heT("app.team.file.card.missingGroups", { groups: "חשבון בנק ופנסיה" }),
      ],
      note: null,
      open: { href: "/team/yoav/file" },
    });
    expect(words?.share?.label).toBe(he.app.team.file.card.share);
  });

  it("counts for anyone else, says who sees the details, and has no way into the file", () => {
    const words = fileCardWords(
      t,
      format,
      card("yoav", "team"),
      "יואב לוי",
      "יואב",
      "m",
    );
    expect(words?.lines).toEqual([
      heT("app.team.file.card.missingCount", { count: 2 }),
    ]);
    expect(words?.note).toBe(he.app.team.file.card.onlyHolders);
    expect(words?.open).toBeNull();
    for (const group of groups) {
      expect(JSON.stringify(words)).not.toContain(group);
    }
  });

  it("sends a link that names nothing missing, and none while viewing", () => {
    const words = fileCardWords(
      t,
      format,
      card("maya", "holder"),
      "מאיה פרץ",
      "מאיה",
      "f",
    );
    expect(words?.share?.message).toBe(
      heT("app.team.file.card.shareMessage", {
        first: "מאיה",
        business: "מסעדת הדגמה",
      }),
    );
    for (const group of groups) {
      expect(words?.share?.message).not.toContain(group);
    }
    expect(words?.lines).toContain(he.app.team.file.card.bankReview);
    const viewing = fileCardWords(
      t,
      format,
      card("yoav", "team", { viewing: true, share: false }),
      "יואב לוי",
      "יואב",
      "m",
    );
    expect(viewing?.share).toBeNull();
    expect(viewing?.note).toBe(he.app.team.file.viewing);
  });

  // Profile H6b-1: the person's own “לא שיניתי” is said apart.
  it("says the person's own “לא שיניתי” on the account, in their form", () => {
    const words = fileCardWords(
      t,
      format,
      card("itay", "holder"),
      "איתי מזרחי",
      "איתי",
      "m",
    );
    expect(words?.lines).toEqual([
      heT("app.team.file.card.bankDisputed", { first: "איתי", form: "m" }),
    ]);
    expect(words?.lines).not.toContain(he.app.team.file.card.bankReview);
    // Anyone else reads no detail, so no account to look at.
    expect(
      fileCardWords(t, format, card("itay", "team"), "איתי מזרחי", "איתי", "m"),
    ).toBeNull();
  });

  it("is no card once the file is complete", () => {
    expect(
      fileCardWords(t, format, card("noa", "holder"), "נועה כהן", "נועה", "f"),
    ).toBeNull();
    expect(
      fileCardWords(t, format, card("noa", "team"), "נועה כהן", "נועה", "f"),
    ).toBeNull();
  });

  it("draws the card with its actions", () => {
    const words = fileCardWords(
      t,
      format,
      card("yoav", "holder"),
      "יואב לוי",
      "יואב",
      "m",
    );
    if (!words) throw new Error("no card");
    const missing: string[] = [];
    const html = renderToString(
      createElement(
        NextIntlClientProvider,
        {
          locale: "he",
          timeZone: "Asia/Jerusalem",
          messages: he,
          onError: (error: Error) => {
            missing.push(error.message);
          },
        } as unknown as Parameters<typeof NextIntlClientProvider>[0],
        createElement(FileCard, { words }),
      ),
    );
    expect(missing).toEqual([]);
    expect(html).toContain(he.app.team.file.card.share);
    expect(html).toContain(he.app.team.file.card.open);
    expect(html).toContain('href="/team/yoav/file"');
  });
});
