import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FileReview } from "@domain/file-holders";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Today's accounts to look at, for an owner (profile H6b-1), drawn on the
// server as a page first is with the twin's people: "לא שיניתי" first, then
// a number the check doubts, then new ones, by name; three at most, the
// rest counted on the team screen; each person's words by the review and
// their form of address, each row leading to their file. And where Today
// puts it: after the open modes, before the person's own file.

vi.mock("server-only", () => ({}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}));

const { createTranslator } = await import("next-intl");
const { FileReviewsSection } = await import("./file-reviews");
const { teamMembers } = await import("../../design/shell/data");
const { baseWording, translator } = await import("../wording");
const he = (await import("@/messages/he.json")).default;

const t = translator(baseWording, "app");
const heT = createTranslator({ locale: "he", messages: he });
const r = he.app.home.fileReviews;

const draw = (reviews: FileReview[], base = "") =>
  renderToString(
    createElement(FileReviewsSection, {
      t,
      reviews,
      members: teamMembers,
      path: (to: string) => `${base}${to}`,
    }),
  );

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");

describe("Today's accounts to look at", () => {
  it("puts “לא שיניתי” first, then a doubted number, then new ones, each to its file", () => {
    const html = draw([
      { userId: "maya", review: "new" },
      { userId: "shiran", review: "warned" },
      { userId: "itay", review: "disputed" },
    ]);
    const page = text(html);
    expect(page).toContain(heT("app.home.fileReviews.title", { count: 3 }));
    expect(page).toContain(r.body);
    const at = (words: string) => page.indexOf(words);
    expect(at("איתי מזרחי")).toBeLessThan(at("שירן אלון"));
    expect(at("שירן אלון")).toBeLessThan(at("מאיה"));
    expect(page).toContain(heT("app.home.fileReviews.disputed", { form: "m" }));
    expect(page).toContain(r.warned);
    expect(page).toContain(r.new);
    expect(html).toContain('href="/team/itay/file"');
    expect(html).toContain('href="/team/maya/file"');
    expect(page).not.toContain(heT("app.home.fileReviews.more", { count: 1 }));
  });

  it("names three at most, and counts the rest on the team screen", () => {
    const html = draw(
      ["noa", "yoav", "maya", "itay", "omer"].map((userId) => ({
        userId,
        review: "new" as const,
      })),
      "/design/shell",
    );
    const page = text(html);
    expect(page).toContain(heT("app.home.fileReviews.title", { count: 5 }));
    expect(html.match(/href="\/design\/shell\/team\/\w+\/file"/g)).toHaveLength(
      3,
    );
    expect(page).toContain(heT("app.home.fileReviews.more", { count: 2 }));
    expect(html).toContain('href="/design/shell/team"');
  });

  it("is nothing with none to look at, or for someone no longer on the team", () => {
    expect(draw([])).toBe("");
    expect(draw([{ userId: "gone", review: "new" }])).toBe("");
  });

  it("comes after the open modes and before the person's own file", () => {
    const view = readFileSync(join(__dirname, "today-view.tsx"), "utf8");
    const modes = view.indexOf("{modeCards.map(");
    const reviews = view.indexOf("<FileReviewsSection");
    const file = view.indexOf("<FileTodayCard");
    expect(modes).toBeGreaterThan(-1);
    expect(reviews).toBeGreaterThan(modes);
    expect(file).toBeGreaterThan(reviews);
    // Only with the team's names: someone who doesn't see the team has none.
    expect(view).toContain("data.reviews?.length && data.team ?");
  });
});
