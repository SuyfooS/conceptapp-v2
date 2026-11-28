import he from "../messages/he.json" with { type: "json" };
import { isolateName } from "../packages/domain/bidi";
import {
  announcer,
  heardSoFar,
  pastDrawing,
  pastSameWords,
  saidSince,
} from "./announcer";
import { HOLD_MS } from "./build-screen";
import { heT, undoNamed } from "./t";
import { expect, type Page, test } from "./test";

// Accessibility, part 6, on the Team screen's twins (/design/shell/team and
// its invite form), and the console's invite link on its own twin at the
// end: no data, no sign-in, nothing stored, so a deletion can
// run out its hold and a link be made as often as the test likes. The real
// screens' own checks are in team-changes.spec.ts and team-invite.spec.ts.

const tt = he.app.team;
const ti = tt.invite;
const tl = tt.link;
// The twin's two invites (app/design/shell/data.ts): one open, one expired.
const DANA = "דנה אברהם";
const RON = "רון שפירא";
// And two the console's wizard saved with no link yet, by name.
const LIOR = "ליאור גבאי";
const IDO = "עידו ברק";

/** Where the invite test keeps what the role's alert said before, on the page's window. */
type RoleWords = { roleWords?: Node[] };

/** Where a test keeps the refusal's line it saw before, on the page's window. */
type SeenLine = { seenLine?: Element };

/** Notes `line` as the one seen, on the page's window. */
const noteLine = (line: Element) => {
  (window as unknown as SeenLine).seenLine = line;
};

/** Whether `line` is another than the one noted. */
const anotherLine = (line: Element) =>
  line !== (window as unknown as SeenLine).seenLine;

/** A new link's "קישור חדש" for a person, in whichever shape is on screen. */
const newLinkFor = (page: Page, name: string) =>
  page
    .getByRole("button", { name: tl.newFor.replace("{name}", name) })
    .filter({ visible: true });

/**
 * The page's clipboard, standing in for the browser's: it takes each copy,
 * or refuses it, as the test says.
 */
const clipboardTakes = (page: Page, takes: boolean) =>
  page.evaluate((takes) => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: () =>
          takes ? Promise.resolve() : Promise.reject(new Error("refused")),
      },
    });
  }, takes);

/** A person's "מחיקת ההזמנה", in whichever shape is on screen. */
const deleteFor = (page: Page, name: string) =>
  page
    .getByRole("button", { name: heT("app.team.cancel.label", { name }) })
    .filter({ visible: true });

/** The "ביטול" of a person's deleted invite, in whichever shape is on screen. */
const undoFor = (page: Page, name: string) =>
  page
    .getByRole("status")
    .filter({ hasText: heT("app.team.cancel.done", { name }) })
    .filter({ visible: true })
    .getByRole("button", { name: he.ui.undoRow.undo });

// A deleted invite's "ביטול" takes the focus its button had, in each shape
// (both draw it; only the one on screen can take it). With the keyboard on
// it the hold waits; undone, the focus is back on the row's "מחיקת ההזמנה",
// brought into view: the page had moved on under the list meanwhile.
// After a mouse's press nothing waits, and once it goes the title of the
// invites' section has the focus, or, with no invite left on a phone's or
// tablet's lists (whose section is drawn anew after the team then), the
// page's title. The desktop's table lists the team too, so its section
// keeps it.
test("the team twin's deleted invite gives 'ביטול' the focus, waits for the keyboard, and gives the focus on", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const desktop = testInfo.project.name === "desktop";
  const section = page.getByRole("main").getByRole("heading", {
    level: 2,
    name: desktop ? tt.everyone : tt.invites.title,
    exact: true,
  });
  const title = page.getByRole("heading", { level: 1, name: tt.title });

  await page.goto("/design/shell/team");
  await page.waitForLoadState("networkidle");
  await deleteFor(page, DANA).focus();
  await page.keyboard.press("Enter");
  await expect(undoFor(page, DANA)).toBeFocused();
  await expect(deleteFor(page, DANA)).toHaveCount(0);
  // Past the hold, with the keyboard on it: still there.
  await page.waitForTimeout(HOLD_MS + 1_000);
  await expect(undoFor(page, DANA)).toBeVisible();
  // "ביטול" at the top of the screen: the row it brings back comes above it.
  await undoFor(page, DANA).evaluate((undo) =>
    undo.scrollIntoView({ block: "start" }),
  );
  await page.keyboard.press("Enter");
  await expect(deleteFor(page, DANA)).toBeFocused();
  await expect(deleteFor(page, DANA)).toBeInViewport();
  await expect(undoFor(page, DANA)).toHaveCount(0);

  // The twin keeps nothing: afresh, and with a mouse.
  await page.reload();
  await page.waitForLoadState("networkidle");
  await deleteFor(page, DANA).click();
  await expect(undoFor(page, DANA)).toBeFocused();
  await expect(undoFor(page, DANA)).toHaveCount(0, {
    timeout: HOLD_MS + 5_000,
  });
  await expect(section).toBeFocused();

  // The last invite left on screen.
  await deleteFor(page, RON).click();
  await expect(undoFor(page, RON)).toBeFocused();
  await expect(undoFor(page, RON)).toHaveCount(0, {
    timeout: HOLD_MS + 5_000,
  });
  await expect(desktop ? section : title).toBeFocused();
});

// A second invite deleted while the first's "ביטול" still waits (a mouse
// resting over it, the keyboard gone on): the first is sent, and its row,
// going, lets go of nothing of the second's, whose "ביטול" has the focus
// and waits past the hold.
test("the team twin's next deleted invite waits for its own 'ביטול', whatever the earlier row waited for", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto("/design/shell/team");
  await page.waitForLoadState("networkidle");
  await deleteFor(page, DANA).focus();
  await page.keyboard.press("Enter");
  await expect(undoFor(page, DANA)).toBeFocused();
  await deleteFor(page, RON).focus();
  await undoFor(page, DANA).hover();
  await page.keyboard.press("Enter");
  await expect(undoFor(page, RON)).toBeFocused();
  await expect(undoFor(page, DANA)).toHaveCount(0);
  // Past the hold, with the keyboard on it: still there.
  await page.waitForTimeout(HOLD_MS + 1_000);
  await expect(undoFor(page, RON)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(deleteFor(page, RON)).toBeFocused();
  await expect(deleteFor(page, DANA)).toHaveCount(0);
});

// A new link in place of its press: "וואטסאפ" takes the focus, and says
// whose link it sends, to nobody on the twin (closing the pilot, PR 4); the
// copy beside it says whose link it copies. Each copy is said by the
// announcer, the same again too, and never by the button as well; one the
// browser refuses is said and shown, and the link is selected in its field,
// to copy by hand.
test("the team twin's new link puts the focus on its WhatsApp, and each copy is said", async ({
  page,
}) => {
  const polite = announcer(page, "polite");
  await page.goto("/design/shell/team");
  await page.waitForLoadState("networkidle");
  await newLinkFor(page, RON).click();
  const whatsapp = page
    .getByRole("link", {
      name: heT("app.team.pending.whatsappFor", { name: RON }),
    })
    .filter({ visible: true });
  await expect(whatsapp).toBeFocused();
  const href = new URL((await whatsapp.getAttribute("href")) ?? "");
  // To nobody: WhatsApp asks whom to send it to.
  expect(`${href.origin}${href.pathname}`).toBe("https://wa.me/");
  expect(href.searchParams.get("text")).toContain(
    heT("app.team.pending.message", { business: isolateName("מסעדת הדגמה") }),
  );
  const copy = page
    .getByRole("button", { name: tl.copy })
    .filter({ visible: true });
  await expect(copy).toHaveAccessibleDescription(
    tl.linkFor.replace("{name}", RON),
  );
  await expect(copy).not.toHaveAttribute("aria-live");
  await copy.focus();

  await clipboardTakes(page, true);
  await heardSoFar(polite);
  await page.keyboard.press("Enter");
  const copied = page
    .getByRole("button", { name: tl.copied })
    .filter({ visible: true });
  await expect(copied).toBeFocused();
  await expect(saidSince(polite, tl.copied)).toHaveCount(1);
  // Again, its words the same: said again.
  await pastSameWords(page);
  await heardSoFar(polite);
  await page.keyboard.press("Enter");
  await expect(saidSince(polite, tl.copied)).toHaveCount(1);

  await clipboardTakes(page, false);
  await heardSoFar(polite);
  await page.keyboard.press("Enter");
  await expect(saidSince(polite, tl.copyFailed)).toHaveCount(1);
  const field = page
    .getByLabel(tl.linkFor.replace("{name}", RON))
    .filter({ visible: true });
  await expect(field).toBeFocused();
  await expect(
    page.getByRole("main").getByText(tl.copyFailed).filter({ visible: true }),
  ).toBeVisible();
  expect(
    await field.evaluate((input) => {
      const shown = input as HTMLInputElement;
      return (
        shown.selectionStart === 0 && shown.selectionEnd === shown.value.length
      );
    }),
  ).toBe(true);
});

// A new link that arrives after the focus was put elsewhere (the next
// control, while the press was busy) leaves the focus there, and the
// announcer says the link is ready.
test("the team twin's new link, ready with the focus put elsewhere meanwhile, is said there", async ({
  page,
}) => {
  const polite = announcer(page, "polite");
  await page.goto("/design/shell/team");
  await page.waitForLoadState("networkidle");
  let answer = () => {};
  const held = new Promise<void>((resolve) => {
    answer = () => resolve();
  });
  await page.route("**/design/shell/team", async (route) => {
    if (route.request().method() === "POST") await held;
    await route.continue();
  });
  const press = newLinkFor(page, RON);
  await press.click();
  await expect(press).toHaveAttribute("aria-busy", "true");
  await deleteFor(page, DANA).focus();
  await heardSoFar(polite);
  answer();
  await expect(saidSince(polite, tl.ready.replace("{name}", RON))).toHaveCount(
    1,
  );
  await expect(deleteFor(page, DANA)).toBeFocused();
  await expect(
    page.getByRole("button", { name: tl.copy }).filter({ visible: true }),
  ).toBeVisible();
  await page.unroute("**/design/shell/team");
});

// A new link refused (the twin's ?resend=refused) is a line of its own,
// drawn anew each time, so the same refusal again is heard, and the press,
// busy meanwhile, has the focus back.
test("the team twin's refused new link is said anew each time, with the focus back on its press", async ({
  page,
}) => {
  await page.goto("/design/shell/team?resend=refused");
  await page.waitForLoadState("networkidle");
  const press = newLinkFor(page, RON);
  const refusal = page
    .getByRole("main")
    .getByRole("alert")
    .filter({ visible: true });
  await press.focus();
  await page.keyboard.press("Enter");
  await expect(refusal).toHaveText(tl.errors.failed);
  await expect(press).toBeFocused();
  await refusal.evaluate(noteLine);
  await page.keyboard.press("Enter");
  await expect.poll(() => refusal.evaluate(anotherLine)).toBe(true);
  await expect(refusal).toHaveText(tl.errors.failed);
  await expect(press).toBeFocused();
});

// A new link is the same in every shape: a screen made narrower than the
// computer's table (a tablet turned) shows it in the lists too, never
// "קישור חדש" again, whose press would stop the link just made.
test("the team twin's new link stays when the screen crosses from the table to the lists", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "from the computer's table to the lists, once",
  );
  await page.goto("/design/shell/team");
  await page.waitForLoadState("networkidle");
  await newLinkFor(page, RON).click();
  const field = page
    .getByLabel(tl.linkFor.replace("{name}", RON))
    .filter({ visible: true });
  await expect(field).toHaveValue(/\/join\//);
  const link = await field.inputValue();
  await page.setViewportSize({ width: 1024, height: 900 });
  await expect(field).toHaveValue(link);
  await expect(newLinkFor(page, RON)).toHaveCount(0);
});

// "עוד לא קיבלו קישור" (inviting from a list, part 2), on the twin's two
// invites the wizard saved with no link: each one's link made at the moment
// of sending, WhatsApp taking the focus; after WhatsApp or a copy the row
// says so, and the focus goes on to the next person's "יצירת קישור", whose
// name the announcer says. A twin's WhatsApp names no number (a made-up one
// may be someone's), and the test keeps it from opening.
test("the team twin's links for those with none go one person at a time, the focus on to the next", async ({
  page,
}) => {
  const tp = tt.pending;
  const main = page.getByRole("main");
  const polite = announcer(page, "polite");
  const create = (name: string) =>
    page
      .getByRole("button", {
        name: heT("app.team.pending.createFor", { name }),
      })
      .filter({ visible: true });
  const whatsappFor = (name: string) =>
    page
      .getByRole("link", {
        name: heT("app.team.pending.whatsappFor", { name }),
      })
      .filter({ visible: true });
  const said = (words: string) =>
    main.getByText(words, { exact: true }).filter({ visible: true });

  await page.goto("/design/shell/team");
  await expect(create(LIOR)).toBeVisible();
  await page.waitForLoadState("networkidle");
  await expect(said(heT("app.team.pending.count", { count: 2 }))).toHaveCount(
    1,
  );
  // WhatsApp is a link the press itself opens: kept from opening here.
  await page.evaluate(() =>
    document.addEventListener(
      "click",
      (event) => {
        if ((event.target as Element).closest('a[href^="https://wa.me/"]')) {
          event.preventDefault();
        }
      },
      true,
    ),
  );

  await create(LIOR).focus();
  await page.keyboard.press("Enter");
  await expect(whatsappFor(LIOR)).toBeFocused();
  const href = new URL((await whatsappFor(LIOR).getAttribute("href")) ?? "");
  expect(href.pathname).toBe("/");
  expect(href.searchParams.get("text")).toContain(
    heT("app.team.pending.message", { business: isolateName("מסעדת הדגמה") }),
  );
  // No chat to any number anywhere on the twin.
  expect(
    await page
      .locator('a[href^="https://wa.me/"]')
      .evaluateAll((links) =>
        links
          .map((a) => a.getAttribute("href") ?? "")
          .filter((h) => /^https:\/\/wa\.me\/\d/.test(h)),
      ),
  ).toEqual([]);
  await expect(said(heT("app.team.pending.count", { count: 1 }))).toHaveCount(
    1,
  );

  await heardSoFar(polite);
  await page.keyboard.press("Enter");
  await expect(said(tp.opened)).toHaveCount(1);
  await expect(create(IDO)).toBeFocused();
  await expect(
    saidSince(polite, heT("app.team.pending.next", { name: IDO })),
  ).toHaveCount(1);
  // Lior's row stays where it was, with its link.
  await expect(whatsappFor(LIOR)).toBeVisible();

  // The last one, copied: nobody is left to go to, and the list says so.
  await clipboardTakes(page, true);
  await page.keyboard.press("Enter");
  await expect(whatsappFor(IDO)).toBeFocused();
  const copy = page
    .getByRole("button", { name: tl.copy })
    .filter({ visible: true })
    .last();
  await copy.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: tl.copied }).filter({ visible: true }),
  ).toBeFocused();
  await expect(said(heT("app.team.pending.left", { count: 0 }))).toHaveCount(1);
  await expect(main.getByText(tp.hint).filter({ visible: true })).toHaveCount(
    0,
  );
});

// The invite form's answers, each heard once (as sign-in's number is): the
// first field refused takes a focus that was anywhere in the form, and why
// is said after its read, out of its description meanwhile; one the person
// put outside the form stays there, and why is said at once; the role's,
// the same twice, is drawn anew each time; the link ready with the focus put
// outside the form is said there; starting over, the focus is on the name,
// and the next link ready puts it on its card's title.
test("the invite twin says each refusal on its field, and the link ready on its title", async ({
  page,
}) => {
  const polite = announcer(page, "polite");
  const assertive = announcer(page, "assertive");
  await page.goto("/design/shell/team/invite");
  await page.waitForLoadState("networkidle");
  const name = page.getByLabel(ti.name, { exact: true });
  const phone = page.getByLabel(ti.phone, { exact: true });

  // Sent from the number with no name: the name takes the focus.
  await phone.fill("050-123-4567");
  await heardSoFar(polite);
  await phone.press("Enter");
  await expect(name).toBeFocused();
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect(saidSince(polite, ti.errors.name.required)).toHaveCount(1);
  await expect(name).not.toHaveAttribute("aria-describedby");
  // Back on it later, why is read with it.
  await name.blur();
  await name.focus();
  await expect(name).toHaveAccessibleDescription(ti.errors.name.required);

  // A number not whole, sent from that very field: the focus stays, and
  // why is said at once. The field sends only a whole number (its hidden
  // input), so the server hears none.
  await name.fill("תמר בדיקה");
  await phone.fill("123");
  await heardSoFar(assertive);
  await phone.press("Enter");
  await expect(saidSince(assertive, ti.errors.phone.required)).toHaveCount(1);
  await expect(phone).toBeFocused();
  await expect(phone).toHaveAttribute("aria-invalid", "true");
  await expect(phone).not.toHaveAttribute("aria-describedby");

  // The focus put outside the form while the answer was on its way stays
  // there; why is said at once, and read with the field when it is reached.
  let answer = () => {};
  const held = new Promise<void>((resolve) => {
    answer = () => resolve();
  });
  await page.route("**/design/shell/team/invite", async (route) => {
    if (route.request().method() === "POST") await held;
    await route.continue();
  });
  await phone.fill("");
  await heardSoFar(assertive);
  const submit = page.getByRole("button", { name: ti.submit });
  // The same words as the line just heard: past the announcer's moment for
  // them, as no one presses again sooner.
  await pastSameWords(page);
  await submit.click();
  await expect(submit).toHaveAttribute("aria-busy", "true");
  // Exact: the link ready brings "חזרה לצוות" too.
  const back = page
    .getByRole("main")
    .getByRole("link", { name: tt.title, exact: true });
  await back.focus();
  answer();
  await expect(saidSince(assertive, ti.errors.phone.required)).toHaveCount(1);
  await expect(back).toBeFocused();
  await expect(phone).toHaveAccessibleDescription(ti.errors.phone.required);
  await page.unroute("**/design/shell/team/invite");

  // The role refused the same way twice (none chosen): the press keeps the
  // focus, and the words are drawn anew in the list's alert each time, so
  // the second is heard as the first was.
  await phone.fill("050-123-4567");
  const roleAlert = page
    .getByRole("group", { name: ti.role, exact: true })
    .getByRole("alert");
  const noRole = () =>
    page.evaluate(() => {
      const radios =
        document.querySelectorAll<HTMLInputElement>('input[name="role"]');
      for (const radio of radios) radio.checked = false;
    });
  await noRole();
  await submit.click();
  await expect(roleAlert).toHaveText(ti.errors.role.required);
  await expect(submit).toBeFocused();
  await roleAlert.evaluate((alert) => {
    (window as unknown as RoleWords).roleWords = [...alert.childNodes];
  });
  await phone.fill("050-123-4567");
  await noRole();
  await submit.click();
  await expect
    .poll(() =>
      roleAlert.evaluate((alert) => {
        const before = (window as unknown as RoleWords).roleWords ?? [];
        return [...alert.childNodes].some((node) => !before.includes(node));
      }),
    )
    .toBe(true);
  await expect(roleAlert).toHaveText(ti.errors.role.required);
  await expect(submit).toBeFocused();

  // The link ready while the focus was put outside the form: it stays
  // there, and the announcer says the link is ready.
  let link = () => {};
  const linkHeld = new Promise<void>((resolve) => {
    link = () => resolve();
  });
  await page.route("**/design/shell/team/invite", async (route) => {
    if (route.request().method() === "POST") await linkHeld;
    await route.continue();
  });
  const ready = (who: string) =>
    page.getByRole("heading", {
      level: 2,
      name: ti.ready.replace("{name}", who),
    });
  await phone.fill("050-123-4567");
  await heardSoFar(polite);
  await submit.click();
  await expect(submit).toHaveAttribute("aria-busy", "true");
  await back.focus();
  link();
  await expect(ready("תמר בדיקה")).toBeVisible();
  await expect(
    saidSince(polite, ti.ready.replace("{name}", "תמר בדיקה")),
  ).toHaveCount(1);
  await expect(back).toBeFocused();
  await expect(ready("תמר בדיקה")).not.toBeFocused();
  await expect(
    page.getByRole("button", { name: tl.copy }),
  ).toHaveAccessibleDescription(tl.linkFor.replace("{name}", "תמר בדיקה"));
  await page.unroute("**/design/shell/team/invite");

  // Someone else: a fresh form, the name ready to write. Their link ready,
  // from the press, puts the focus on its card's title, which says so.
  await page.getByRole("button", { name: ti.another }).click();
  await expect(name).toBeFocused();
  await expect(name).toHaveValue("");
  await name.fill("רון בדיקה");
  await phone.fill("050-765-4321");
  await submit.click();
  await expect(ready("רון בדיקה")).toBeFocused();
});

// A name fix on its way holds its sheet: Escape and "סגירה" wait for its
// answer, so the sheet still closes onto the fix's "ביטול", whose focus
// says what it undoes, and never onto the row with the undo unheard. The
// row is quiet as it appears, behind the sheet: the announcer doesn't say
// its words as well.
test("the person twin's name fix holds its sheet until its answer, then closes onto 'ביטול'", async ({
  page,
}) => {
  const tc = tt.changes;
  const polite = announcer(page, "polite");
  const main = page.getByRole("main");
  const nameRow = main
    .getByRole("button")
    .filter({ has: page.getByText(tc.name, { exact: true }) });
  await page.goto("/design/shell/team/noa");
  await page.waitForLoadState("networkidle");
  await nameRow.click();
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel(ti.name, { exact: true }).fill("נועה כהן-לוי");

  let answer = () => {};
  const held = new Promise<void>((resolve) => {
    answer = () => resolve();
  });
  await page.route("**/design/shell/team/noa", async (route) => {
    if (route.request().method() === "POST") await held;
    await route.continue();
  });
  const submit = sheet.getByRole("button", { name: tc.nameSubmit });
  await submit.click();
  await expect(submit).toHaveAttribute("aria-busy", "true");
  await page.keyboard.press("Escape");
  await sheet.getByRole("button", { name: tc.close }).click();
  await expect(sheet).toBeVisible();
  await heardSoFar(polite);
  answer();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const changed = heT("app.team.changes.nameChanged", {
    name: "נועה כהן-לוי",
  });
  const undoName = main
    .getByRole("status")
    .filter({ hasText: changed })
    .getByRole("button", { name: he.ui.undoRow.undo });
  await expect(undoName).toBeFocused();
  await expect(undoName).toHaveAccessibleName(undoNamed(changed));
  await pastDrawing(page);
  await expect(saidSince(polite, changed)).toHaveCount(0);
  await page.unroute("**/design/shell/team/noa");
});

// The name fixed by the keyboard alone: the sheet closes onto "ביטול",
// whose focus came from a key, so its eight seconds wait while it has it;
// undone, the focus is back on the row "שם", and the name as it was.
test("the person twin's name fix by the keyboard closes onto a 'ביטול' that waits while it has the focus", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const tc = tt.changes;
  const main = page.getByRole("main");
  const nameRow = main
    .getByRole("button")
    .filter({ has: page.getByText(tc.name, { exact: true }) });
  await page.goto("/design/shell/team/noa");
  await page.waitForLoadState("networkidle");
  await nameRow.focus();
  await page.keyboard.press("Enter");
  const field = page.getByRole("dialog").getByLabel(ti.name, { exact: true });
  await field.fill("נועה כהן-לוי");
  await field.press("Enter");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const undoName = main
    .getByRole("status")
    .filter({
      hasText: heT("app.team.changes.nameChanged", { name: "נועה כהן-לוי" }),
    })
    .getByRole("button", { name: he.ui.undoRow.undo });
  await expect(undoName).toBeFocused();
  // Past its time, with the keyboard on it: still there.
  await page.waitForTimeout(HOLD_MS + 1_000);
  await expect(undoName).toBeVisible();
  await expect(undoName).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(nameRow).toBeFocused();
  await expect(
    main.getByRole("heading", { level: 1, name: "נועה כהן", exact: true }),
  ).toBeVisible();
});

// The name sheet's own refusal (no name) is said once, through the
// announcer, never by an alert as well: from the press, the field takes the
// focus and why is said after its read; again from the field (Enter), the
// same words, it is said again, at once. While the field has the focus why
// is out of its description, so it isn't said twice.
test("the person twin's name sheet says its own refusal once, the same again too", async ({
  page,
}) => {
  const tc = tt.changes;
  const required = ti.errors.name.required;
  const polite = announcer(page, "polite");
  const assertive = announcer(page, "assertive");
  await page.goto("/design/shell/team/noa");
  await page.waitForLoadState("networkidle");
  await page
    .getByRole("main")
    .getByRole("button")
    .filter({ has: page.getByText(tc.name, { exact: true }) })
    .click();
  const sheet = page.getByRole("dialog");
  const field = sheet.getByLabel(ti.name, { exact: true });
  await field.fill("");
  await heardSoFar(polite);
  await sheet.getByRole("button", { name: tc.nameSubmit }).click();
  await expect(field).toBeFocused();
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await expect(saidSince(polite, required)).toHaveCount(1);
  await expect(field).not.toHaveAttribute("aria-describedby");
  await expect(sheet.getByText(required)).toBeVisible();
  await expect(sheet.getByRole("alert")).toHaveCount(0);

  await pastSameWords(page);
  await heardSoFar(assertive);
  await field.press("Enter");
  await expect(saidSince(assertive, required)).toHaveCount(1);
  await expect(field).toBeFocused();
  await expect(field).not.toHaveAttribute("aria-describedby");
});

// A fix the server refuses (the network drops it, here) keeps the sheet
// open with its line, and the press, busy while the fix was on its way, has
// the focus back: never left on the sheet's own frame.
test("the person twin's name sheet gives the focus back to its press when a fix is refused", async ({
  page,
}) => {
  const tc = tt.changes;
  const person = "**/design/shell/team/noa";
  await page.goto("/design/shell/team/noa");
  await page.waitForLoadState("networkidle");
  await page
    .getByRole("main")
    .getByRole("button")
    .filter({ has: page.getByText(tc.name, { exact: true }) })
    .click();
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel(ti.name, { exact: true }).fill("נועה כהן-לוי");

  let answer = () => {};
  const held = new Promise<void>((resolve) => {
    answer = () => resolve();
  });
  await page.route(person, async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    await held;
    await route.abort();
  });
  const submit = sheet.getByRole("button", { name: tc.nameSubmit });
  await submit.focus();
  await page.keyboard.press("Enter");
  await expect(submit).toHaveAttribute("aria-busy", "true");
  // Busy, it loses the focus as the page is drawn.
  await pastDrawing(page);
  answer();
  await expect(sheet.getByRole("alert")).toHaveText(tc.failures.failed);
  await expect(sheet).toBeVisible();
  await expect(submit).toBeFocused();
  await page.unroute(person);
});

// The console's invite link, on its twin (/design/console/businesses), as
// the Team screen's new link: "בר הים" has יואב's invite open and רונית's
// run out. A link that arrives with the focus put elsewhere while its press
// was busy is said there; one that arrives in place of its press puts the
// focus on its "וואטסאפ", which says whose link it sends, to nobody on the
// twin, and the copy beside it says whose link it copies.
const ci = he.admin.setup.invite;
const CONSOLE_BUSINESS = "/design/console/businesses/bar-hayam";
const YOAV = "יואב לוי";
const RONIT = "רונית שמש";

/** The console's press for a person's invite link, in whichever shape is on screen. */
const issueFor = (page: Page, name: string, renew = false) =>
  page
    .getByRole("button", {
      name: (renew ? ci.renewFor : ci.createFor).replace("{name}", name),
    })
    .filter({ visible: true });

test("the console twin's invite link is said where the focus was put, or puts the focus on its WhatsApp", async ({
  page,
}) => {
  const polite = announcer(page, "polite");
  await page.goto(CONSOLE_BUSINESS);
  await page.waitForLoadState("networkidle");

  let answer = () => {};
  const held = new Promise<void>((resolve) => {
    answer = () => resolve();
  });
  const business = (url: URL) => url.pathname === CONSOLE_BUSINESS;
  await page.route(business, async (route) => {
    if (route.request().method() === "POST") await held;
    await route.continue();
  });
  const renew = issueFor(page, RONIT, true);
  await renew.click();
  await expect(renew).toHaveAttribute("aria-busy", "true");
  const create = issueFor(page, YOAV);
  await create.focus();
  await heardSoFar(polite);
  answer();
  await expect(
    saidSince(polite, ci.ready.replace("{name}", RONIT)),
  ).toHaveCount(1);
  await expect(create).toBeFocused();
  await expect(
    page.getByLabel(ci.linkFor.replace("{name}", RONIT)).filter({
      visible: true,
    }),
  ).toHaveValue(/\/join\//);
  await page.unroute(business);

  await page.keyboard.press("Enter");
  await expect(create).toHaveCount(0);
  const focused = page.locator(":focus");
  await expect(focused).toHaveAccessibleName(
    heT("app.team.pending.whatsappFor", { name: YOAV }),
  );
  const href = new URL((await focused.getAttribute("href")) ?? "");
  expect(`${href.origin}${href.pathname}`).toBe("https://wa.me/");
  await expect(
    page.getByRole("button", { name: ci.copy }).filter({ visible: true }),
  ).toHaveAccessibleDescription(ci.linkFor.replace("{name}", YOAV));
  // No chat to any number anywhere on the twin.
  for (const link of await page.locator('a[href^="https://wa.me/"]').all()) {
    expect(await link.getAttribute("href")).toMatch(
      /^https:\/\/wa\.me\/\?text=/,
    );
  }
});

// A link refused (the twin's ?issue=refused) is a line of its own, drawn
// anew each time, so the same refusal again is heard, and the press, busy
// meanwhile, has the focus back.
test("the console twin's refused invite link is said anew each time, with the focus back on its press", async ({
  page,
}) => {
  await page.goto(`${CONSOLE_BUSINESS}?issue=refused`);
  await page.waitForLoadState("networkidle");
  const press = issueFor(page, YOAV);
  const refusal = page
    .getByRole("alert")
    .filter({ hasText: ci.errors.failed })
    .filter({ visible: true });
  await press.focus();
  await page.keyboard.press("Enter");
  await expect(refusal).toHaveText(ci.errors.failed);
  await expect(press).toBeFocused();
  await refusal.evaluate(noteLine);
  await page.keyboard.press("Enter");
  await expect.poll(() => refusal.evaluate(anotherLine)).toBe(true);
  await expect(refusal).toHaveText(ci.errors.failed);
  await expect(press).toBeFocused();
});
