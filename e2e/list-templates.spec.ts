import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import {
  bumpDemoTemplate,
  clearSchedule,
  demoTemplates,
  endViewSessions,
  removeDemoTemplates,
  resetDemoLists,
  scheduleDemoSunday,
  sentDemoLists,
} from "./db";
import { signIn } from "./session";
import { heT } from "./t";

// Lists, part 3 (L3): the business's templates and their editor, which saves
// itself, and the full send (a list typed now, a shift, a due time). The
// people are seeded in supabase/seed.sql: Shiran manages the demo restaurant,
// Noa works in its kitchen and Yoav at its bar. Tests that write make
// templates and lists of their own, by name, and remove them afterwards; the
// restaurant's own templates are only read.
const MANAGER = { local: "050-000-0002", e164: "+972500000002" };
const NOA = { name: "נועה כהן", e164: "+972500000003" };
const YOAV = { e164: "+972500000004" };
const ADMIN = { local: "050-000-0005", e164: "+972500000005" };

const OPENING = "פתיחת מטבח";
const MADE = "ניקיון שבועי של הבדיקה";
const RENAMED = "ניקיון של הבדיקה";
const TYPED = "רשימה של הבדיקה";
const CONSOLE = "רשימה מהקונסולה";

const l = he.app.lists;
const tt = l.templates;
const te = l.templates.editor;
const ti = l.items;
const ts = l.send;
const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const fill = (text: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce(
    (out, [key, value]) => out.replaceAll(`{${key}}`, String(value)),
    text,
  );

async function expectCleanPage(page: Page) {
  await expect(page).toHaveTitle(/ConceptApp$/);
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(
    violations.flatMap((v) =>
      v.nodes.map((n) => `${v.id}: ${n.target.join(" ")} ${n.failureSummary}`),
    ),
  ).toEqual([]);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

/** A template's row on its screen, or its link in the table, whichever shows. */
const templateLink = (page: Page, name: string) =>
  page
    .getByRole("main")
    .getByRole("link", { name: new RegExp(`^${literal(name)}`) })
    .filter({ visible: true })
    .first();

/**
 * Adds an item from the sheet: its kind, its name, and what else it needs. A
 * bound below zero given as a number takes the "מינוס" toggle; given as text
 * it is typed as it is, minus and all, which turns the toggle on.
 */
async function addItem(
  page: Page,
  item: {
    kind: "check" | "number" | "note";
    label: string;
    optional?: boolean;
    min?: number | string;
    max?: number | string;
    unit?: string;
  },
) {
  await page.getByRole("button", { name: ti.add, exact: true }).click();
  const sheet = page.getByRole("dialog", { name: ti.newTitle });
  await sheet
    .getByRole("button", { name: ti.kinds[item.kind], exact: true })
    .click();
  await sheet.getByLabel(ti.label, { exact: true }).fill(item.label);
  if (item.unit)
    await sheet.getByLabel(ti.unit, { exact: true }).fill(item.unit);
  for (const [which, value] of [
    ["min", item.min],
    ["max", item.max],
  ] as const) {
    if (value === undefined) continue;
    const minus = sheet.getByRole("button", {
      name: fill(ti.minusOf, { field: ti[which] }),
    });
    if (typeof value === "string") {
      await sheet.getByLabel(ti[which], { exact: true }).fill(value);
      if (/^[-−]/.test(value)) {
        await expect(minus).toHaveAttribute("aria-pressed", "true");
        await expect(sheet.getByLabel(ti[which], { exact: true })).toHaveValue(
          value.slice(1),
        );
      }
      continue;
    }
    if (value < 0) await minus.click();
    await sheet
      .getByLabel(ti[which], { exact: true })
      .fill(String(Math.abs(value)));
  }
  if (item.optional) {
    await sheet.getByRole("switch", { name: ti.required }).click();
  }
  await sheet.getByRole("button", { name: ti.create, exact: true }).click();
  await expect(sheet).toBeHidden();
}

test.afterEach(async () => {
  await removeDemoTemplates([MADE, RENAMED, TYPED, CONSOLE]);
  await resetDemoLists();
  await endViewSessions(ADMIN.e164);
});

test("a manager finds the business's lists and reads one in its editor", async ({
  page,
}, testInfo) => {
  await signIn(page, MANAGER);
  await page.goto("/lists");
  await page
    .getByRole("main")
    .getByRole("link", {
      name: new RegExp(`^${literal(l.templatesRow.title)}`),
    })
    .click();
  await expect(page).toHaveURL(/\/lists\/templates$/);
  await expect(
    page.getByRole("heading", { level: 1, name: tt.title }),
  ).toBeVisible();
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("list-templates.png"),
    fullPage: true,
  });

  await templateLink(page, OPENING).click();
  await expect(page).toHaveURL(/\/lists\/templates\/[0-9a-f-]{36}$/);
  await expect(
    page.getByRole("heading", { level: 1, name: OPENING }),
  ).toBeVisible();
  await expect(page.getByLabel(te.name, { exact: true })).toHaveValue(OPENING);
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("list-template.png"),
    fullPage: true,
  });

  // The sheet for a new item, read and closed without adding anything.
  await page.getByRole("button", { name: ti.add, exact: true }).click();
  const sheet = page.getByRole("dialog", { name: ti.newTitle });
  await expect(sheet).toBeVisible();
  const { violations } = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
});

test("a manager writes a new list of every kind, which saves itself, and sends it", async ({
  page,
}, testInfo) => {
  // It writes the shared demo restaurant: once, on the widest screen.
  test.skip(testInfo.project.name !== "desktop", "one run is enough");
  await signIn(page, MANAGER);
  await page.goto("/lists/templates");
  await page
    .getByRole("main")
    .getByRole("link", { name: tt.create, exact: true })
    .click();
  await expect(page).toHaveURL(/\/lists\/templates\/new$/);
  await expect(page.getByText(te.newSubtitle)).toBeVisible();

  // Saved once it has a name and an item, at its own address.
  await page.getByLabel(te.name, { exact: true }).fill(MADE);
  await addItem(page, { kind: "check", label: "ניקוי מקרר ראשי" });
  await expect(page).toHaveURL(/\/lists\/templates\/[0-9a-f-]{36}$/);
  await expect
    .poll(async () => (await demoTemplates(MADE))[0]?.items.length)
    .toBe(1);

  // A number below zero, its lowest with the minus toggle and its highest
  // typed with its minus (kept, never dropped), and an optional note.
  await addItem(page, {
    kind: "number",
    label: "מקפיא",
    unit: "°C",
    min: -25,
    max: "-18",
  });
  await addItem(page, { kind: "note", label: "מה חסר", optional: true });
  await expect
    .poll(async () => (await demoTemplates(MADE))[0]?.items)
    .toEqual([
      {
        kind: "check",
        label: "ניקוי מקרר ראשי",
        required: true,
        min: null,
        max: null,
      },
      { kind: "number", label: "מקפיא", required: true, min: -25, max: -18 },
      { kind: "note", label: "מה חסר", required: false, min: null, max: null },
    ]);
  await expect(
    page.getByText("−25 – −18 °C").filter({ visible: true }).first(),
  ).toBeVisible();

  // Up and down, rather than a drag.
  const labels = async () =>
    (await demoTemplates(MADE))[0]?.items.map((item) => item.label);
  await page
    .getByRole("button", { name: fill(ti.up, { label: "מה חסר" }) })
    .click();
  await expect.poll(labels).toEqual(["ניקוי מקרר ראשי", "מה חסר", "מקפיא"]);
  // From the keyboard: the focus stays on the item's arrows (the other one
  // once it reaches the top), and where it went is said.
  const up = page.getByRole("button", {
    name: fill(ti.up, { label: "מה חסר" }),
  });
  const down = page.getByRole("button", {
    name: fill(ti.down, { label: "מה חסר" }),
  });
  await up.focus();
  await page.keyboard.press("Enter");
  await expect(up).toBeDisabled();
  await expect(down).toBeFocused();
  await expect(
    page.getByText(fill(ti.movedTo, { label: "מה חסר", place: 1, count: 3 })),
  ).toBeAttached();
  await expect.poll(labels).toEqual(["מה חסר", "ניקוי מקרר ראשי", "מקפיא"]);
  await page.keyboard.press("Enter");
  await expect(down).toBeFocused();
  await expect.poll(labels).toEqual(["ניקוי מקרר ראשי", "מה חסר", "מקפיא"]);
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("list-template-made.png"),
    fullPage: true,
  });

  // An item removed from its sheet, then put back by its undo where it was;
  // the next save still goes through, with the item as a new one.
  await page.getByRole("button", { name: /^מקפיא/ }).click();
  const freezer = page.getByRole("dialog", { name: "מקפיא" });
  await freezer.getByRole("button", { name: ti.remove, exact: true }).click();
  await expect(freezer).toBeHidden();
  await expect.poll(labels).toEqual(["ניקוי מקרר ראשי", "מה חסר"]);
  await page
    .getByRole("status")
    .filter({ hasText: fill(ti.removed, { label: "מקפיא" }) })
    .getByRole("button", { name: he.app.manage.undo })
    .click();
  await expect.poll(labels).toEqual(["ניקוי מקרר ראשי", "מה חסר", "מקפיא"]);
  await page
    .getByRole("button", { name: fill(ti.up, { label: "מקפיא" }) })
    .click();
  await expect.poll(labels).toEqual(["ניקוי מקרר ראשי", "מקפיא", "מה חסר"]);

  // Renamed: saved shortly after the typing stops. The save comes back, with
  // its version, before anyone else saves.
  const renamed = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.request().headers()["next-action"] !== undefined,
  );
  await page.getByLabel(te.name, { exact: true }).fill(RENAMED);
  await renamed;
  await expect.poll(async () => (await demoTemplates(RENAMED)).length).toBe(1);

  // Someone else saves it meanwhile: the next save is refused, and the
  // editor opens again with the latest, saying so.
  const [made] = await demoTemplates(RENAMED);
  if (!made) throw new Error("The template wasn't saved");
  await bumpDemoTemplate(made.id);
  await page
    .getByLabel(te.note, { exact: true })
    .filter({ visible: true })
    .fill("לפני שבת מנקים גם את המנדף");
  await page
    .getByLabel(te.note, { exact: true })
    .filter({ visible: true })
    .blur();
  const changed = page.getByRole("status").filter({ hasText: te.changed });
  await expect(changed).toBeVisible();
  await expect(
    page.getByLabel(te.note, { exact: true }).filter({ visible: true }),
  ).toHaveValue("נשמר במסך אחר");
  // It is said once: the address loses `?changed=`, so a reload doesn't.
  await expect(page).toHaveURL(/\/lists\/templates\/[0-9a-f-]{36}$/);
  // From the latest, saving works again, and the notice goes.
  await page
    .getByLabel(te.note, { exact: true })
    .filter({ visible: true })
    .fill("ניקיון לפני שבת");
  await page
    .getByLabel(te.note, { exact: true })
    .filter({ visible: true })
    .blur();
  await expect
    .poll(async () => (await demoTemplates(RENAMED))[0]?.note)
    .toBe("ניקיון לפני שבת");
  await expect(changed).toHaveCount(0);

  // Who it goes to, saved at once: a department, a role, then each time.
  const recipient = async () => (await demoTemplates(RENAMED))[0]?.recipient;
  await page
    .getByRole("button", { name: te.recipientKinds.department, exact: true })
    .click();
  await expect.poll(recipient).toBe("department");
  await page
    .getByRole("button", { name: te.recipientKinds.role, exact: true })
    .click();
  await expect.poll(recipient).toBe("role");
  await page
    .getByRole("button", { name: te.recipientKinds.none, exact: true })
    .click();
  await expect.poll(recipient).toBeNull();

  // Removed, with the undo on the screen of templates.
  await page.getByRole("button", { name: te.archive }).click();
  await expect(page).toHaveURL(/\/lists\/templates\?removed=/);
  await expect
    .poll(async () => (await demoTemplates(RENAMED))[0]?.archived)
    .toBe(true);
  await page
    .getByRole("status")
    .filter({ hasText: fill(tt.removed, { name: RENAMED }) })
    .getByRole("button", { name: he.app.manage.undo })
    .click();
  await expect(page).toHaveURL(/\/lists\/templates$/);
  await expect
    .poll(async () => (await demoTemplates(RENAMED))[0]?.archived)
    .toBe(false);
  await expect(templateLink(page, RENAMED)).toBeVisible();

  // Removed again, then brought back from the folded list of removed ones.
  await templateLink(page, RENAMED).click();
  await page.getByRole("button", { name: te.archive }).click();
  await expect(page).toHaveURL(/\/lists\/templates\?removed=/);
  await expect
    .poll(async () => (await demoTemplates(RENAMED))[0]?.archived)
    .toBe(true);
  await page.getByRole("main").locator("details > summary").click();
  const restore = page.getByRole("button", {
    name: fill(tt.restoreOf, { name: RENAMED }),
  });
  await expect(restore).toBeVisible();
  await expectCleanPage(page);
  await restore.click();
  await expect
    .poll(async () => (await demoTemplates(RENAMED))[0]?.archived)
    .toBe(false);
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: fill(tt.restored, { name: RENAMED }) }),
  ).toBeVisible();
  await expect(templateLink(page, RENAMED)).toBeVisible();

  // Sent now from its editor, to Noa.
  await templateLink(page, RENAMED).click();
  await page.getByRole("button", { name: te.sendNow }).click();
  await expect(page).toHaveURL(/\/lists\/send\?template=[0-9a-f-]{36}$/);
  await expect(
    page.getByRole("radio", { name: new RegExp(`^${literal(RENAMED)}`) }),
  ).toBeChecked();
  await page
    .getByRole("radio", { name: new RegExp(`^${literal(NOA.name)}`) })
    .check();
  await page
    .getByRole("button", {
      name: fill(ts.submit.person, { name: NOA.name }),
    })
    .click();
  await expect(page).toHaveURL(/\/lists\?sent=/);
  await expect
    .poll(async () => (await sentDemoLists(RENAMED))[0])
    .toMatchObject({ recipient: "person", people: 1, status: "open" });
});

test("a manager types a list now and sends it to a shift, due tomorrow", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one run is enough");
  // Next week's Sunday is published: Yoav in the morning, Noa in the evening.
  await clearSchedule();
  try {
    await scheduleDemoSunday(
      { morning: [[YOAV.e164, "bartender"]], evening: [[NOA.e164, "waiter"]] },
      true,
    );
    await signIn(page, MANAGER);
    await page.goto("/lists/send?template=new");
    await expect(
      page.getByRole("radio", { name: new RegExp(`^${literal(ts.newList)}`) }),
    ).toBeChecked();
    await page.getByLabel(ts.typedName, { exact: true }).fill(TYPED);
    await addItem(page, { kind: "number", label: "ספירת כוסות" });
    await addItem(page, { kind: "check", label: "שטיפת מגשים" });

    await page
      .getByRole("button", { name: ts.kinds.shift, exact: true })
      .click();
    await page.getByRole("radio", { name: /^ערב/ }).check();
    await page
      .getByRole("button", { name: ts.dueDays.tomorrow, exact: true })
      .click();
    await expectCleanPage(page);
    await page.screenshot({
      path: testInfo.outputPath("send-typed.png"),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: fill(ts.submit.shift, { name: "ערב" }) })
      .click();
    await expect(page).toHaveURL(/\/lists\?sent=/);
    await expect
      .poll(async () => (await sentDemoLists(TYPED))[0])
      .toMatchObject({
        recipient: "shift",
        due: true,
        people: 1,
        items: [
          { kind: "number", label: "ספירת כוסות" },
          { kind: "check", label: "שטיפת מגשים" },
        ],
      });
    // Where it went, with the way to take it back.
    await expect(
      page
        .getByRole("status")
        .filter({
          hasText: fill(ts.sent, {
            to: heT("app.lists.card.to.shift", { count: 1 }),
          }),
        })
        .first(),
    ).toBeVisible();
  } finally {
    await clearSchedule();
  }
});

test("the team sets up a business's list in the console", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one run is enough");
  await signIn(page, ADMIN, /\/admin$/);
  await page.goto("/admin/businesses/demo-restaurant/settings");
  await page
    .getByRole("main")
    .getByRole("link", { name: new RegExp(`^${literal(tt.title)}`) })
    .click();
  await expect(page).toHaveURL(/\/admin\/businesses\/demo-restaurant\/lists$/);
  await expect(templateLink(page, OPENING)).toBeVisible();
  await expectCleanPage(page);

  await page
    .getByRole("main")
    .getByRole("link", { name: tt.create, exact: true })
    .click();
  await page.getByLabel(te.name, { exact: true }).fill(CONSOLE);
  await addItem(page, { kind: "check", label: "פתיחת המקום" });
  await expect(page).toHaveURL(
    /\/admin\/businesses\/demo-restaurant\/lists\/[0-9a-f-]{36}$/,
  );
  await expect
    .poll(async () => (await demoTemplates(CONSOLE))[0]?.items.length)
    .toBe(1);
  // The team sends nothing: no main action to send it.
  await expect(page.getByRole("button", { name: te.sendNow })).toHaveCount(0);
});
