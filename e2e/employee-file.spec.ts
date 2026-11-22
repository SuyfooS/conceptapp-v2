import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, type TestInfo, test } from "@playwright/test";
import en from "../messages/en.json" with { type: "json" };
import he from "../messages/he.json" with { type: "json" };
import { checkBankAccount } from "../packages/domain/bank-account";
import { HOLD_MS } from "./build-screen";
import {
  clearDemoFile,
  codesSentSince,
  demoFileFacts,
  demoFileLog,
  demoModuleSettings,
  demoTaxYear,
  forgetDemoJoin,
  inviteToDemoLink,
  notePhoneChange,
  restoreDemoFile,
  setDemoBankChanged,
  setDemoModuleSettings,
} from "./db";
import { enterAs } from "./orders-parts";
import { SMS_COOLDOWN_MS, secondPage, signIn } from "./session";
import { latestCode, setDemoModule } from "./sms";
import { heT } from "./t";

// The worker's own hiring file (profile H5a), at each width. The local demo
// restaurant takes file writes ("fileWrites": true in supabase/seed.sql); the
// module is off there, so each test switches it on and off again, starts
// Noa's file empty and gives her the made-up one back after. Noa signs in
// with her own number, which the bank's code goes to. People from
// supabase/seed.sql: Noa, a worker; Galit, the accountant; Uri, the owner;
// Shiran, a manager. What the business asks (H5b) is its settings: each
// test that changes them sets its own, and the hooks put the defaults back.
const NOA = {
  id: "00000000-0000-4000-a000-000000000003",
  local: "050-000-0003",
  e164: "+972500000003",
};
const BUSINESS = "מסעדת הדגמה";

const f = he.app.file;
const mf = he.app.me.file;

type Step = keyof typeof f.steps.name;

const main = (page: Page) => page.getByRole("main");
const visible = (page: Page, role: "button" | "link", name: string) =>
  page.getByRole(role, { name, exact: true }).filter({ visible: true });
/** A step's section: on a phone and a tablet only the one on screen. */
const section = (page: Page, step: Step) =>
  page.getByRole("region", { name: f.steps.name[step], exact: true });
/**
 * "אישור החשבון בקוד", the account's own: the dock's on a phone and a tablet,
 * the section's on a desktop (whose summary offers the same press).
 */
const bankConfirm = (page: Page) =>
  section(page, "bank")
    .getByRole("button", { name: f.bank.confirm, exact: true })
    .filter({ visible: true });
/** A step's row in the list beside the steps, by where it stands. */
const stepRow = (page: Page, step: Step, state: keyof typeof f.steps.state) =>
  visible(page, "link", `${f.steps.name[step]} · ${f.steps.state[state]}`);

const isDesktop = (testInfo: TestInfo) => testInfo.project.name === "desktop";

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

/** The business's day, as the screens read it. */
function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" })
    .format(new Date())
    .slice(0, 10);
}

/**
 * Save a step: on a phone and a tablet its main action floats above the tab
 * bar and moves to the next step; on a desktop the section's own save, and
 * the list beside the steps marks it done.
 */
async function save(
  page: Page,
  testInfo: TestInfo,
  step: Step,
  desktopLabel: string,
) {
  if (isDesktop(testInfo)) {
    await section(page, step)
      .getByRole("button", { name: desktopLabel })
      .click();
    await expect(stepRow(page, step, "done")).toBeVisible();
  } else {
    await visible(page, "button", f.actions.next).click();
    await expect(page).not.toHaveURL(new RegExp(`step=${step}$`));
  }
}

/** From the welcome to the first step: a desktop shows them all already. */
async function start(page: Page, testInfo: TestInfo) {
  await expect(
    main(page).getByText(heT("app.file.welcome.title", { business: BUSINESS })),
  ).toBeVisible();
  if (!isDesktop(testInfo)) {
    await visible(page, "button", f.welcome.start).click();
    await expect(page).toHaveURL(/\/me\/file\?step=start$/);
  }
}

/** Steps 0 to 2 through the screens: the feminine form, the ID, the address. */
async function fillToBank(page: Page, testInfo: TestInfo) {
  const first = section(page, "start");
  await first.getByRole("radio", { name: f.start.f }).check();
  await save(page, testInfo, "start", f.actions.saveStart);

  const identity = section(page, "identity");
  await identity.getByLabel(f.identity.idNumber).fill("000000018");
  await identity.getByLabel(f.identity.firstName).fill("נועה");
  await identity.getByLabel(f.identity.lastName).fill("כהן");
  const birth = identity.getByRole("group", { name: f.identity.birthDate });
  await birth.getByLabel(f.date.day).fill("1");
  await birth.getByLabel(f.date.month).fill("1");
  await birth.getByLabel(f.date.year).fill("1995");
  await save(page, testInfo, "identity", f.actions.saveIdentity);

  const address = section(page, "address");
  await address.getByRole("combobox", { name: f.address.city }).fill("תל אביב");
  await page.getByRole("option", { name: "תל אביב - יפו" }).click();
  await address.getByLabel(f.address.street, { exact: true }).fill("הרצל");
  await address.getByLabel(f.address.number, { exact: true }).fill("12");
  await save(page, testInfo, "address", f.actions.saveAddress);
}

/** "אישור החשבון בקוד", waiting out the auth server's wait if a code just went. */
async function askForBankCode(page: Page): Promise<Date> {
  let since = new Date(Date.now() - 1000);
  await bankConfirm(page).click();
  const code = page.getByLabel(f.bank.code.label);
  const tooSoon = page.getByText(f.bank.code.rateLimit);
  await expect(code.or(tooSoon)).toBeVisible();
  if (await tooSoon.isVisible()) {
    await page.waitForTimeout(SMS_COOLDOWN_MS + 500);
    since = new Date(Date.now() - 1000);
    await bankConfirm(page).click();
  }
  await expect(code).toBeVisible();
  return since;
}

test.beforeEach(async () => {
  await setDemoModule("employee_files", true);
  await clearDemoFile(NOA.id);
});

test.afterEach(async () => {
  await restoreDemoFile(NOA.id);
  await setDemoModuleSettings("employee_files", {});
  await setDemoModule("employee_files", false);
});

test("a new worker picks how to be addressed, stops at the account and comes back to it", async ({
  page,
}, testInfo) => {
  await signIn(page, NOA);
  await page.goto("/me");
  await expect(
    main(page).getByText(heT("app.me.file.missing", { count: 4 })),
  ).toBeVisible();
  await expectCleanPage(page);
  await visible(page, "link", mf.complete).click();
  await expect(page).toHaveURL(/\/me\/file$/);
  await expectCleanPage(page);
  await start(page, testInfo);
  await fillToBank(page, testInfo);
  await expect(section(page, "bank")).toBeVisible();

  // Away, and back from the profile: the file picks up at the account.
  await page.goto("/home");
  await page.goto("/me");
  await expect(
    main(page).getByText(heT("app.me.file.missing", { count: 2 })),
  ).toBeVisible();
  await visible(page, "link", mf.complete).click();
  await expect(page).toHaveURL(/\/me\/file$/);
  if (testInfo.project.name === "phone") {
    await expect(
      main(page).getByText(
        heT("app.file.steps.count", { current: 4, count: 6 }),
      ),
    ).toBeVisible();
  } else {
    for (const step of ["start", "identity", "address"] as const) {
      await expect(stepRow(page, step, "done")).toBeVisible();
    }
    await expect(stepRow(page, "bank", "open")).toHaveAttribute(
      "aria-current",
      "step",
    );
  }
  if (isDesktop(testInfo)) {
    await expect(section(page, "bank")).toBeInViewport();
    // The summary beside the steps lists what is still missing, and only
    // that: not the step rows, which name every step whatever its state.
    const stillMissing = page
      .getByRole("complementary", { name: f.steps.title })
      .getByRole("list", { name: f.summary.title });
    await expect(stillMissing.getByRole("listitem")).toHaveText([
      f.steps.name.bank,
      f.steps.name.pension,
      f.steps.name.form101,
    ]);
  }
  await expect(section(page, "bank")).toBeVisible();
  await expectCleanPage(page);

  const facts = await demoFileFacts(NOA.id);
  expect(facts?.idKind).toBe("il");
  // Sealed in server code, never the demo's made-up format.
  expect(facts?.idByte).toBe(1);

  // Form 101 from the profile's row: with the account still open, the
  // file can't go yet, and its action leads there instead.
  await page.goto("/me/file?step=form101");
  await expect(
    visible(
      page,
      "button",
      heT("app.file.actions.send", { business: BUSINESS }),
    ),
  ).toHaveCount(0);
  await visible(page, "button", f.actions.finish.bank).click();
  await expect(page).toHaveURL(/step=bank$/);
  expect((await demoFileFacts(NOA.id))?.submitted).toBe(false);
});

test("a wrong account number gets a warning in words and is saved with a flag", async ({
  page,
}, testInfo) => {
  // A code by SMS and every step.
  test.slow();
  // An account the check warns about: Hapoalim, branch 600.
  const typed = { bank: 12, branch: 600, account: "100002" };
  const check = checkBankAccount(typed, today());
  expect(check.status).toBe("warning");
  const warning =
    check.status === "warning" ? f.bank.warning[check.warning] : "";

  await signIn(page, NOA);
  await page.goto("/me/file");
  await start(page, testInfo);
  await fillToBank(page, testInfo);

  const bank = section(page, "bank");
  await bank.getByLabel(f.bank.paste).fill("12-600-100002");
  await expect(bank.getByLabel(f.bank.account)).toHaveValue("100002");
  await expect(bank.getByText(warning)).toBeVisible();
  // The main action waits until the number is kept as it is.
  await bank.getByRole("radio", { name: f.bank.self, exact: true }).check();
  await bank
    .getByRole("checkbox", {
      name: heT("app.file.bank.instruction", { form: "f", business: BUSINESS }),
    })
    .check();
  // Only the warning is in the way: said above the action, which takes
  // the person to the number and sends nothing.
  const checkFirst = page
    .getByText(heT("app.file.bank.checkFirst", { keep: f.bank.keep }))
    .filter({ visible: true });
  await expect(checkFirst).toBeVisible();
  const before = new Date(Date.now() - 1000);
  await bankConfirm(page).click();
  await expect(bank.getByLabel(f.bank.account)).toBeFocused();
  await expect(page.getByLabel(f.bank.code.label)).toHaveCount(0);
  expect(await codesSentSince(NOA.e164, before)).toBe(0);
  await bank.getByRole("button", { name: f.bank.keep }).click();
  await expect(
    bank.getByText(heT("app.file.bank.kept", { business: BUSINESS })),
  ).toBeVisible();
  await expect(checkFirst).toHaveCount(0);
  await expectCleanPage(page);

  const since = await askForBankCode(page);
  // Said with the last four digits of her own number, and no more of it.
  await expect(
    bank.getByText(
      f.bank.code.sent.replace(/<\/?ltr>/g, "").replace("{tail}", "0003"),
    ),
  ).toBeVisible();
  await page
    .getByLabel(f.bank.code.label)
    .fill(await latestCode(NOA.e164, since));
  await expect(
    bank.getByText(heT("app.file.bank.savedWarned", { business: BUSINESS })),
  ).toBeVisible();
  // The account as its last digits, never the whole number.
  await expect(bank.getByText("•••0002")).toBeVisible();
  await expect(bank.getByText("100002")).toHaveCount(0);
  await expectCleanPage(page);

  const facts = await demoFileFacts(NOA.id);
  expect(facts?.bankReview).toBe("warned");
  expect(facts?.bankCode).toBe(12);
  expect(facts?.bankByte).toBe(1);
  // The log names the groups that changed, never a value.
  const fields = (await demoFileLog(NOA.id)).flatMap(
    (details) => (details as { fields: string[] }).fields,
  );
  expect(fields).toContain("bank");
  for (const field of fields) expect(field).not.toMatch(/\d/);

  // The pension, then Form 101, and the whole file sent.
  if (!isDesktop(testInfo)) {
    await visible(page, "button", f.actions.continue).click();
    await expect(page).toHaveURL(/step=pension$/);
  }
  const pension = section(page, "pension");
  await pension
    .getByRole("radio", { name: f.pension.yes, exact: true })
    .check();
  await pension
    .getByRole("button", {
      name: new RegExp(`^${f.pension.which.replace("?", "\\?")}`),
    })
    .click();
  await page
    .getByRole("menuitemradio", { name: he.pensionFunds.harel })
    .click();
  await save(page, testInfo, "pension", f.actions.savePension);

  const form = section(page, "form101");
  await form.getByRole("button", { name: f.form101.handedIn }).click();
  await expect(
    page.getByRole("status").filter({
      hasText: heT("app.file.form101.handedInSaved", { business: BUSINESS }),
    }),
  ).toBeVisible();
  await visible(
    page,
    "button",
    heT("app.file.actions.send", { business: BUSINESS }),
  ).click();
  await expect(page).toHaveURL(/step=done$/);
  await expect(
    main(page).getByRole("heading", { name: f.done.title }),
  ).toBeVisible();
  await expectCleanPage(page);

  const sent = await demoFileFacts(NOA.id);
  expect(sent?.submitted).toBe(true);
  expect(sent?.pensionAnswer).toBe("existing");
  expect(sent?.form101).toBe("handed_in");
});

test("a 16-year-old sees the medical-certificate card", async ({ page }) => {
  await signIn(page, NOA);
  await page.goto("/me/file?step=identity");
  const identity = section(page, "identity");
  const [year = "", month = ""] = today().split("-");
  const birth = identity.getByRole("group", { name: f.identity.birthDate });
  await birth.getByLabel(f.date.day).fill("1");
  await birth.getByLabel(f.date.month).fill(String(Number(month)));
  await birth.getByLabel(f.date.year).fill(String(Number(year) - 16));
  await expect(
    identity.getByText(
      heT("app.file.identity.minorBody", { business: BUSINESS }),
    ),
  ).toBeVisible();
  await expectCleanPage(page);
  // Typed only: nothing is saved before the step is.
  expect(await demoFileFacts(NOA.id)).toBeNull();
});

test("the flow switches to English, and back", async ({ page }, testInfo) => {
  await signIn(page, NOA);
  await page.goto("/me/file?step=start");
  const first = section(page, "start");
  await first.getByRole("radio", { name: f.start.en }).check();
  await first.getByRole("radio", { name: f.start.f }).check();
  if (isDesktop(testInfo)) {
    await first.getByRole("button", { name: f.actions.saveStart }).click();
  } else {
    await visible(page, "button", f.actions.next).click();
  }
  const english = page.locator('[dir="ltr"][lang="en"]');
  await expect(
    english.getByRole("heading", {
      level: 2,
      name: en.app.file.steps.name.identity,
    }),
  ).toBeVisible();
  await expect(
    english.getByRole("heading", {
      level: 1,
      name: en.app.file.title.replace("{business}", BUSINESS),
    }),
  ).toBeVisible();
  await expectCleanPage(page);

  // What was typed in the step stays through the switch.
  await english
    .getByRole("region", { name: en.app.file.steps.name.identity })
    .getByLabel(en.app.file.identity.firstName)
    .fill("Noa");
  await english
    .getByRole("button", { name: en.app.file.language.switch })
    .click();
  await expect(english).toHaveCount(0);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: heT("app.file.title", { business: BUSINESS }),
    }),
  ).toBeVisible();
  await expect(
    section(page, "identity").getByLabel(f.identity.firstName),
  ).toHaveValue("Noa");
});

test("the welcome goes on where the person stopped", async ({
  page,
}, testInfo) => {
  test.skip(isDesktop(testInfo), "A desktop shows every step under it.");
  await signIn(page, NOA);
  await page.goto("/me/file?step=start");
  await section(page, "start").getByRole("radio", { name: f.start.f }).check();
  await save(page, testInfo, "start", f.actions.saveStart);

  // Step 0 is the profile's, so the file is still new: the welcome again,
  // and its way in leads on to the step after it.
  await page.goto("/me/file");
  await expect(
    main(page).getByText(heT("app.file.welcome.title", { business: BUSINESS })),
  ).toBeVisible();
  await visible(page, "button", f.welcome.start).click();
  await expect(page).toHaveURL(/\/me\/file\?step=identity$/);
  await expect(section(page, "identity")).toBeVisible();
});

test("the own ID shows masked, and hides again after a minute", async ({
  page,
}, testInfo) => {
  await page.clock.install();
  await signIn(page, NOA);
  await page.goto("/me/file");
  await start(page, testInfo);
  await fillToBank(page, testInfo);
  await page.goto("/me/file?step=identity");
  const identity = section(page, "identity");
  await expect(identity.getByText("•••0018")).toBeVisible();
  await identity.getByRole("button", { name: f.masked.show }).click();
  await expect(identity.getByText("000000018")).toBeVisible();
  await expectCleanPage(page);
  await page.clock.fastForward(60_000);
  await expect(identity.getByText("•••0018")).toBeVisible();
  await expect(identity.getByText("000000018")).toHaveCount(0);
});

// The week after a phone change: the account is tried before any SMS, so
// no code goes to a number the hold doesn't trust, and the day it opens is
// said, with the code's action off until then.
test("an account waits a week after a phone change, and no code goes", async ({
  page,
}, testInfo) => {
  await notePhoneChange(NOA.id, 2);
  await signIn(page, NOA);
  await page.goto("/me/file");
  await start(page, testInfo);
  await fillToBank(page, testInfo);
  const bank = section(page, "bank");
  await bank.getByLabel(f.bank.paste).fill("12-600-100001");
  await bank.getByRole("radio", { name: f.bank.self, exact: true }).check();
  await bank
    .getByRole("checkbox", {
      name: heT("app.file.bank.instruction", { form: "f", business: BUSINESS }),
    })
    .check();
  const before = new Date(Date.now() - 1000);
  await bankConfirm(page).click();
  await expect(
    bank
      .getByText(f.bank.phoneHold.split("{date}")[0] ?? "")
      .filter({ visible: true }),
  ).toBeVisible();
  await expect(page.getByLabel(f.bank.code.label)).toHaveCount(0);
  await expect(bankConfirm(page)).toBeDisabled();
  if (isDesktop(testInfo)) {
    // The summary's action is the account's own: held as well.
    await expect(
      page
        .getByRole("complementary", { name: f.steps.title })
        .getByRole("button", { name: f.bank.confirm }),
    ).toBeDisabled();
  }
  expect(await codesSentSince(NOA.e164, before)).toBe(0);
  expect((await demoFileFacts(NOA.id))?.bankCode).toBeNull();
  await expectCleanPage(page);
});

// Step 0's language is the file's own until one is picked there: after the
// language button above, it shows the new one, and saving step 0 keeps it.
test("step 0 follows the language button, and keeps it", async ({
  page,
}, testInfo) => {
  await signIn(page, NOA);
  await page.goto("/me/file?step=start");
  await page.getByRole("button", { name: f.language.switch }).click();
  const english = page.locator('[dir="ltr"][lang="en"]');
  const first = english.getByRole("region", {
    name: en.app.file.steps.name.start,
  });
  await expect(
    first.getByRole("radio", { name: en.app.file.start.en }),
  ).toBeChecked();
  await first.getByRole("radio", { name: en.app.file.start.f }).check();
  if (isDesktop(testInfo)) {
    await first
      .getByRole("button", { name: en.app.file.actions.saveStart })
      .click();
  } else {
    await visible(page, "button", en.app.file.actions.next).click();
    await expect(page).toHaveURL(/step=identity$/);
  }
  await expect(
    page.getByText(en.app.file.saved, { exact: true }),
  ).toBeVisible();
  // Still English: the file's language wasn't taken back.
  await page.reload();
  await expect(
    english.getByRole("heading", {
      level: 1,
      name: en.app.file.title.replace("{business}", BUSINESS),
    }),
  ).toBeVisible();
});

test("the file answers no-store and stays closed to others", async ({
  page,
  browser,
}, testInfo) => {
  await signIn(page, NOA);
  const response = await page.goto("/me/file");
  expect(response?.headers()["cache-control"]).toContain("no-store");

  // The accountant is off the staff: no file of her own here.
  const galit = await secondPage(browser, testInfo);
  await galit.goto("/enter");
  await galit
    .getByRole("region", { name: he.auth.enter.businesses.restaurant.name })
    .getByRole("button", {
      name: new RegExp(he.auth.enter.people.accountant.name),
    })
    .click();
  await expect(galit).toHaveURL(/\/home$/);
  await galit.goto("/me/file");
  await expect(
    galit.getByRole("heading", { level: 1, name: he.app.notFound.title }),
  ).toBeVisible();
  await galit.context().close();

  // With the module off, nobody has one.
  await setDemoModule("employee_files", false);
  await page.goto("/me/file");
  await expect(
    page.getByRole("heading", { level: 1, name: he.app.notFound.title }),
  ).toBeVisible();
  await page.goto("/me");
  await expect(
    main(page).getByRole("heading", {
      name: heT("app.me.file.title", { business: BUSINESS }),
    }),
  ).toHaveCount(0);
});

// What each business asks (profile H5b). Each test sets its own settings;
// the hooks put the defaults back before the module goes off.

/** Step 2 named by the ways to reach the person, the address not asked. */
const contactSection = (page: Page) =>
  page.getByRole("region", { name: f.steps.name.contact, exact: true });

test("the business's settings decide the steps", async ({ page }, testInfo) => {
  await setDemoModuleSettings("employee_files", {
    askBank: false,
    askAddress: false,
    askEmergencyContact: true,
    askWorkLanguage: true,
    form101: "off",
  });
  await signIn(page, NOA);
  await page.goto("/me");
  await page.waitForLoadState("networkidle");
  // The identity and the pension are what the file counts now.
  await expect(
    main(page).getByText(heT("app.me.file.missing", { count: 2 })),
  ).toBeVisible();
  const form101Row = mf.rows.form101.split("<ltr>")[0]?.trim() ?? "";
  for (const row of [mf.rows.address, mf.rows.bank, form101Row]) {
    await expect(
      main(page).getByRole("link", { name: new RegExp(row) }),
    ).toHaveCount(0);
  }
  await expect(
    main(page).getByRole("link", { name: new RegExp(mf.rows.emergency) }),
  ).toBeVisible();
  await expectCleanPage(page);

  await visible(page, "link", mf.complete).click();
  await expect(page).toHaveURL(/\/me\/file$/);
  await page.waitForLoadState("networkidle");
  await expect(
    main(page)
      .getByText(heT("app.file.welcome.body", { count: 4 }))
      .filter({ visible: true }),
  ).toBeVisible();
  await start(page, testInfo);
  await section(page, "start").getByRole("radio", { name: f.start.f }).check();
  await save(page, testInfo, "start", f.actions.saveStart);
  const identity = section(page, "identity");
  await identity.getByLabel(f.identity.idNumber).fill("000000018");
  await identity.getByLabel(f.identity.firstName).fill("נועה");
  await identity.getByLabel(f.identity.lastName).fill("כהן");
  const birth = identity.getByRole("group", { name: f.identity.birthDate });
  await birth.getByLabel(f.date.day).fill("1");
  await birth.getByLabel(f.date.month).fill("1");
  await birth.getByLabel(f.date.year).fill("1995");
  await save(page, testInfo, "identity", f.actions.saveIdentity);

  // "דרכי קשר": the language and the contact, no address.
  const contact = contactSection(page);
  await expect(contact).toBeVisible();
  await expect(contact.getByLabel(f.address.city)).toHaveCount(0);
  await contact
    .getByLabel(
      heT("app.file.optionalField", { field: f.address.workLanguage }),
    )
    .fill("ערבית");
  await contact.getByLabel(f.address.emergencyName).fill("דוד כהן");
  await contact.getByLabel(f.address.emergencyPhone).fill("052-000-0099");
  if (testInfo.project.name === "phone") {
    await expect(
      main(page).getByText(
        heT("app.file.steps.count", { current: 3, count: 4 }),
      ),
    ).toBeVisible();
  } else {
    await expect(
      page
        .getByRole("complementary", { name: f.steps.title })
        .getByRole("list")
        .first()
        .getByRole("listitem"),
    ).toHaveCount(4);
  }
  if (isDesktop(testInfo)) {
    await expect(
      page.getByRole("region", { name: f.steps.name.bank, exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: f.steps.name.form101, exact: true }),
    ).toHaveCount(0);
    await contact.getByRole("button", { name: f.actions.saveContact }).click();
    await expect(
      visible(page, "link", `${f.steps.name.contact} · ${f.steps.state.done}`),
    ).toBeVisible();
  } else {
    await visible(page, "button", f.actions.next).click();
    await expect(page).toHaveURL(/step=pension$/);
  }

  // The pension, then the done screen sends the file: no Form 101 here.
  const pension = section(page, "pension");
  await pension
    .getByRole("radio", {
      name: heT("app.file.pension.employer", { business: BUSINESS }),
    })
    .check();
  if (isDesktop(testInfo)) {
    await pension.getByRole("button", { name: f.actions.savePension }).click();
    await expect(stepRow(page, "pension", "done")).toBeVisible();
  } else {
    await visible(page, "button", f.actions.next).click();
    await expect(page).toHaveURL(/step=done$/);
  }
  await visible(
    page,
    "button",
    heT("app.file.actions.send", { business: BUSINESS }),
  )
    .first()
    .click();
  await expect(page).toHaveURL(/step=done$/);
  await expect
    .poll(async () => (await demoFileFacts(NOA.id))?.submitted)
    .toBe(true);
  const facts = await demoFileFacts(NOA.id);
  // Sealed in server code, never the demo's made-up format.
  expect(facts?.emergencyByte).toBe(1);
  expect(facts?.workLanguageByte).toBe(1);
  expect(facts?.bankCode).toBeNull();
  // The log names what changed, and holds no value.
  const log = JSON.stringify(await demoFileLog(NOA.id));
  expect(log).toContain("work_language");
  for (const value of ["ערבית", "0099", "דוד"]) {
    expect(log).not.toContain(value);
  }
  await expectCleanPage(page);
});

test("the owner sets Form 101's link, and the worker hands it in there", async ({
  page,
  browser,
}, testInfo) => {
  const s = he.modules.employee_files.settings;
  if (testInfo.project.name === "phone") {
    // The owner's part on one width: the settings screen is /manage's.
    const uri = await secondPage(browser, testInfo);
    await enterAs(uri, "owner");
    await uri.goto("/manage/employee_files");
    await uri.waitForLoadState("networkidle");
    await uri
      .getByRole("button", { name: new RegExp(`^${s.form101.label}`) })
      .click();
    await uri
      .getByRole("menuitemradio", { name: s.form101.options.link })
      .click();
    await uri
      .getByLabel(new RegExp(s.form101Provider.label))
      .fill("משרד השכר הדגמה");
    await uri.getByLabel(new RegExp(s.form101Provider.label)).blur();
    const link = uri.getByLabel(new RegExp(s.form101Link.label));
    await expect(link).toHaveAttribute("dir", "ltr");
    await expect(link).toHaveAttribute("inputmode", "url");
    await link.fill("http://101.example/x");
    await link.blur();
    await expect(
      uri.getByRole("alert").filter({ hasText: he.app.manage.failed.invalid }),
    ).toBeVisible();
    await link.fill("https://101.example/noa");
    await link.blur();
    await expect
      .poll(async () => await demoModuleSettings("employee_files"))
      .toMatchObject({
        form101: "link",
        form101Provider: "משרד השכר הדגמה",
        form101Link: "https://101.example/noa",
      });
    await expectCleanPage(uri);
    await uri.context().close();

    // A manager who edits the management page has none of it.
    const shiran = await secondPage(browser, testInfo);
    await enterAs(shiran, "manager");
    await shiran.goto("/manage/employee_files");
    await expect(
      shiran.getByRole("heading", { level: 1, name: he.app.notFound.title }),
    ).toBeVisible();
    await shiran.context().close();
  } else {
    await setDemoModuleSettings("employee_files", {
      form101: "link",
      form101Provider: "משרד השכר הדגמה",
      form101Link: "https://101.example/noa",
    });
  }
  await setDemoModuleSettings("employee_files", {
    ...(await demoModuleSettings("employee_files")),
    payrollProvider: "משרד רואי החשבון",
    employerPhone: "+97231234567",
  });

  await signIn(page, NOA);
  await page.goto("/me/file?step=form101");
  await page.waitForLoadState("networkidle");
  const form = section(page, "form101");
  const open = form.getByRole("link", {
    name: heT("app.file.form101.open", { provider: "משרד השכר הדגמה" }),
  });
  await expect(open).toHaveAttribute("href", "https://101.example/noa");
  await expect(open).toHaveAttribute("target", "_blank");
  await expect(open).toHaveAttribute("rel", /noopener/);
  await expect(open).toHaveAttribute("rel", /noreferrer/);
  await expect(
    form.getByText("נפתח באתר 101.example, בחלון חדש"),
  ).toBeVisible();
  await form.getByRole("button", { name: f.form101.handedIn }).click();
  await expect(
    page.getByRole("status").filter({
      hasText: heT("app.file.form101.handedInSaved", { business: BUSINESS }),
    }),
  ).toBeVisible();
  // Her file holds no details yet: the form's own row says it, with the
  // route the server took from the settings.
  await expect
    .poll(async () => await demoTaxYear(NOA.id))
    .toEqual({ status: "handed_in", route: "link" });

  // The notice names who prepares the payroll, the system and the phone.
  // A desktop's is in the summary; a phone's and a tablet's in the step.
  await visible(page, "button", isDesktop(testInfo) ? f.notice.title : f.why)
    .first()
    .click();
  const sheet = page.getByRole("dialog", { name: f.notice.title });
  await expect(sheet.getByText(/משרד רואי החשבון/)).toBeVisible();
  await expect(sheet.getByText(/משרד השכר הדגמה/)).toBeVisible();
  await expect(sheet.getByText("03-123-4567")).toBeVisible();
  await expectCleanPage(page);
});

test("Today asks for what is missing, and tells of a bank change", async ({
  page,
  browser,
}, testInfo) => {
  // A hide waits out its hold once, and a second device signs in.
  test.setTimeout(120_000);
  const b = he.app.home.file.bank;
  await signIn(page, NOA);
  await page.goto("/home");
  await page.waitForLoadState("networkidle");
  await expect(
    main(page).getByText(heT("app.me.file.missing", { count: 4 })),
  ).toBeVisible();
  await expectCleanPage(page);
  // The database's groups, end to end: two when neither the address nor the
  // account is asked.
  await setDemoModuleSettings("employee_files", {
    askBank: false,
    askAddress: false,
  });
  await page.reload();
  await expect(
    main(page).getByText(heT("app.me.file.missing", { count: 2 })),
  ).toBeVisible();
  await visible(page, "link", mf.complete).click();
  await expect(page).toHaveURL(/\/me\/file$/);
  await expect(
    main(page).getByText(heT("app.file.welcome.title", { business: BUSINESS })),
  ).toBeVisible();

  // Her made-up file back, its account changed two days ago.
  await setDemoModuleSettings("employee_files", {});
  await restoreDemoFile(NOA.id);
  await setDemoBankChanged(NOA.id, 2);
  await page.goto("/home");
  await page.waitForLoadState("networkidle");
  const card = main(page).getByRole("region", { name: b.title });
  await expect(card).toBeVisible();
  await expect(card.getByText(/חשבון הבנק לשכר עודכן ב-/)).toBeVisible();
  await expect(
    main(page).getByText(heT("app.home.file.complete")),
  ).toBeVisible();
  await expectCleanPage(page);

  // "אני שיניתי" hides it at once, "ביטול" in its place with the focus;
  // "ביטול" brings it back, the focus on the button again.
  const mine = card.getByRole("button", { name: b.mine });
  const undo = page
    .getByRole("status")
    .filter({ hasText: b.hidden })
    .getByRole("button", { name: he.app.manage.undo });
  await mine.click();
  await expect(card).toHaveCount(0);
  await expect(undo).toBeFocused();
  await undo.click();
  await expect(card).toBeVisible();
  await expect(mine).toBeFocused();

  // The account changes again while the card is on screen (someone with
  // her number, a moment ago): the hide was for the change the card told,
  // so nothing is kept, and Today, drawn again, tells the newer one.
  await setDemoBankChanged(NOA.id, 1);
  const answered = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/home/bank-seen",
    { timeout: HOLD_MS + 15_000 },
  );
  await mine.click();
  expect((await answered).status()).toBe(409);
  const newer = new Intl.DateTimeFormat("he", {
    day: "numeric",
    month: "long",
    timeZone: "Asia/Jerusalem",
  }).format(new Date(Date.now() - 24 * 60 * 60 * 1000));
  await expect(
    card.getByText(
      heT("app.home.file.bank.body", { date: newer, business: BUSINESS }),
    ),
  ).toBeVisible();
  expect(
    (await page.context().cookies()).find((one) => one.name === "ca_bank_seen"),
  ).toBeUndefined();

  // For real: leaving Today inside the app sends it, and this device keeps
  // that very change seen.
  await mine.click();
  await expect(undo).toBeVisible();
  await main(page)
    .getByRole("link", { name: new RegExp(he.modules.employee_files.name) })
    .click();
  await expect(page).toHaveURL(/\/me\/file/);
  await expect
    .poll(
      async () =>
        (await page.context().cookies()).find(
          (one) => one.name === "ca_bank_seen",
        )?.value ?? "",
    )
    .toContain(`.${NOA.id}.`);

  // "לא שיניתי" stays in the bank step all the same.
  await page.goto("/me/file?step=bank");
  await page.waitForLoadState("networkidle");
  const bank = section(page, "bank");
  await expect(bank.getByText(/החשבון עודכן ב-/)).toBeVisible();
  await bank.getByRole("button", { name: f.bank.dispute }).click();
  const marked = bank.getByText(
    heT("app.file.bank.disputed", { business: BUSINESS }),
  );
  await expect(marked).toBeVisible();
  await expect(marked).toBeFocused();
  await expect
    .poll(async () => (await demoFileFacts(NOA.id))?.bankReview)
    .toBe("disputed");
  await expectCleanPage(page);
  // Seen on this device: Today doesn't tell it here again.
  await page.goto("/home");
  await page.waitForLoadState("networkidle");
  await expect(main(page).getByRole("region", { name: b.title })).toHaveCount(
    0,
  );
  await expect(
    main(page).getByRole("region", { name: b.disputedTitle }),
  ).toHaveCount(0);

  // Hidden on this device only: another one still says it, disputed, and
  // "הבנתי" hides it there the same way.
  const other = await secondPage(browser, testInfo);
  await signIn(other, NOA);
  await other.goto("/home");
  const disputed = other
    .getByRole("main")
    .getByRole("region", { name: b.disputedTitle });
  await expect(disputed).toBeVisible();
  await disputed.getByRole("button", { name: b.seen }).click();
  await expect(disputed).toHaveCount(0);
  await expect(
    other
      .getByRole("status")
      .filter({ hasText: b.hidden })
      .getByRole("button", { name: he.app.manage.undo }),
  ).toBeFocused();
  await other.context().close();

  // An owner isn't counted: no card, whatever their file holds.
  const uri = await secondPage(browser, testInfo);
  await enterAs(uri, "owner");
  await uri.waitForLoadState("networkidle");
  await expect(
    uri.getByRole("main").getByRole("link", { name: mf.complete }),
  ).toHaveCount(0);
  await expect(
    uri
      .getByRole("main")
      .getByRole("link", { name: new RegExp(he.modules.employee_files.name) }),
  ).toBeVisible();
  await uri.context().close();
});

/** One number a project, so the three can run at once. */
const JOINING: Record<string, { name: string; e164: string }> = {
  phone: { name: "עדי מצטרפת", e164: "+972500000811" },
  tablet: { name: "עדי מצטרפת", e164: "+972500000812" },
  desktop: { name: "עדי מצטרפת", e164: "+972500000813" },
};

test("a new worker who joins lands on the file's welcome", async ({
  page,
}, testInfo) => {
  const person = JOINING[testInfo.project.name] ?? JOINING.phone;
  if (!person) throw new Error("a number for the project");
  const j = he.auth.join;
  try {
    const token = await inviteToDemoLink({
      name: person.name,
      phone: person.e164,
      role: "worker",
    });
    await page.goto(`/join/${token}`);
    const since = new Date(Date.now() - 1000);
    await page.getByRole("button", { name: j.send }).click();
    await expect(page.getByLabel(j.codeLabel)).toBeVisible();
    await page
      .getByLabel(j.codeLabel)
      .fill(await latestCode(person.e164, since));
    await expect(page).toHaveURL(/\/me\/file$/);
    await expect(
      main(page).getByText(
        heT("app.file.welcome.title", { business: BUSINESS }),
      ),
    ).toBeVisible();
    await expectCleanPage(page);

    if (testInfo.project.name === "phone") {
      // With the module off, Today, as before.
      await page.context().clearCookies();
      await setDemoModule("employee_files", false);
      const again = await inviteToDemoLink({
        name: person.name,
        phone: person.e164,
        role: "worker",
      });
      await page.goto(`/join/${again}`);
      const next = new Date(Date.now() - 1000);
      await page.getByRole("button", { name: j.send }).click();
      const tooSoon = page.getByText(he.auth.signIn.errors.rateLimit);
      const code = page.getByLabel(j.codeLabel);
      await expect(code.or(tooSoon)).toBeVisible();
      if (await tooSoon.isVisible()) {
        await page.waitForTimeout(SMS_COOLDOWN_MS + 500);
        await page.getByRole("button", { name: j.send }).click();
      }
      await code.fill(await latestCode(person.e164, next));
      await expect(page).toHaveURL(/\/home$/);
    }
  } finally {
    await forgetDemoJoin(person.e164);
  }
});
