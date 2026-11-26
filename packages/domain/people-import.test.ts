import { describe, expect, it, vi } from "vitest";
import type { Role, Viewer } from "./modules";
import {
  againstTeam,
  groupOf,
  type ImportRoles,
  importRolesOf,
  importsPeople,
  type KnownInvite,
  type KnownTeam,
  knownTeamOf,
  listRoleOf,
  type ParsedPeople,
  PEOPLE_IMPORT_CHARS,
  PEOPLE_IMPORT_MAX,
  type PeopleLine,
  parsePeopleList,
  peopleImportRows,
  tableOrder,
  teamKnownOf,
  WAITING_INVITES_MAX,
  writtenRoleOf,
} from "./people-import";
import type { NamedRole } from "./role-access";
import {
  buildTeam,
  type GivableNamedRole,
  inviteChoices,
  ownerOnlyRoles,
} from "./team";

const LRM = String.fromCodePoint(0x200e);
const RLM = String.fromCodePoint(0x200f);
const ZERO_WIDTH = String.fromCodePoint(0x200b);
const ACUTE = String.fromCodePoint(0x301);

/** The business's words for the built-in roles, as `app.roles` has them. */
const LABELS: Record<Role, string> = {
  owner: "בעלים",
  manager: "ניהול",
  worker: "צוות",
  accountant: "הנהלת חשבונות",
};

const SHIFT_LEAD_ID = "6a0e4f1c-6c51-4d8e-9a7b-2f0f6c1d3e01";
const SHIFT_LEAD: GivableNamedRole = {
  id: SHIFT_LEAD_ID,
  name: "אחראי משמרת",
  nameEn: "Shift lead",
  base: "worker",
  holds: ["schedule.edit"],
};
const HOST_ID = "6a0e4f1c-6c51-4d8e-9a7b-2f0f6c1d3e02";
const HOST: GivableNamedRole = {
  id: HOST_ID,
  name: "מארחת",
  nameEn: "Host",
  base: "worker",
  holds: [],
};
const NAMED: readonly GivableNamedRole[] = [SHIFT_LEAD, HOST];
const names = (roles: readonly GivableNamedRole[]): NamedRole[] =>
  roles.map(({ holds: _holds, ...role }) => role);

function rolesFor(
  viewer: Viewer,
  { pay = [] as Role[], named = NAMED } = {},
): ImportRoles {
  return importRolesOf({
    choices: inviteChoices(viewer, named, ownerOnlyRoles(viewer, pay)),
    named: names(named),
    labels: LABELS,
  });
}

const OWNER = rolesFor({ role: "owner", perms: [] });
const MANAGER = rolesFor({
  role: "manager",
  perms: ["team.view", "team.edit"],
});
/** A worker raised to edit the team, who holds none of what the shift lead holds. */
const EDITOR = rolesFor({ role: "worker", perms: ["team.view", "team.edit"] });

function parse(text: string, roles: ImportRoles = OWNER): ParsedPeople {
  const fallback = listRoleOf(roles);
  if (!fallback) throw new Error("No role to give");
  return parsePeopleList(text, roles, fallback);
}

type Person = Extract<PeopleLine, { kind: "person" }>;
type Problem = Extract<PeopleLine, { kind: "problem" }>;

const people = (parsed: ParsedPeople) =>
  parsed.lines.flatMap((line) => (line.kind === "person" ? [line] : []));
const persons = (parsed: ParsedPeople) =>
  people(parsed).map((line) => line.person);
const problems = (parsed: ParsedPeople) =>
  parsed.lines.flatMap((line): [number, string][] =>
    line.kind === "problem" ? [[line.line, line.problem]] : [],
  );
const only = (parsed: ParsedPeople): Person => {
  const [line, more] = people(parsed);
  if (!line || more) throw new Error(`Not one person: ${parsed.lines.length}`);
  return line;
};
const problemAt = (parsed: ParsedPeople, at: number): Problem => {
  const line = parsed.lines.find((one) => one.line === at);
  if (line?.kind !== "problem") throw new Error(`No problem on line ${at}`);
  return line;
};

const worker = (name: string, phone: string) => ({
  name,
  phone,
  role: "worker",
  namedRole: null,
  roleFromLine: false,
});

describe("importRolesOf", () => {
  it("gives an owner the staff roles and the named ones, owners and accountants one by one", () => {
    expect(
      OWNER.choices.map((choice) => [
        choice.label,
        choice.names,
        choice.blocked,
      ]),
    ).toEqual([
      ["ניהול", ["ניהול"], null],
      ["צוות", ["צוות"], null],
      ["אחראי משמרת", ["אחראי משמרת", "Shift lead"], null],
      ["מארחת", ["מארחת", "Host"], null],
    ]);
    expect(OWNER.oneByOne.map((role) => role.label)).toEqual([
      "בעלים",
      "הנהלת חשבונות",
    ]);
    expect(OWNER.aboveRank).toEqual([]);
  });

  it("keeps managers above a worker who edits the team, and blocks what they don't hold", () => {
    expect(
      EDITOR.choices.map((choice) => [choice.label, choice.blocked]),
    ).toEqual([
      ["צוות", null],
      ["אחראי משמרת", "held"],
      ["מארחת", null],
    ]);
    expect(EDITOR.aboveRank.map((role) => role.label)).toEqual(["ניהול"]);
  });

  it("says whether the viewer invites owners and accountants one at a time: an owner alone", () => {
    const given = (roles: ImportRoles) =>
      roles.oneByOne.map((role) => [role.role, role.given]);
    expect(given(OWNER)).toEqual([
      ["owner", true],
      ["accountant", true],
    ]);
    for (const roles of [MANAGER, EDITOR]) {
      expect(given(roles)).toEqual([
        ["owner", false],
        ["accountant", false],
      ]);
    }
  });

  it("starts the list on workers, else the first role the viewer gives", () => {
    expect(listRoleOf(OWNER)?.label).toBe("צוות");
    const paid = rolesFor(
      { role: "manager", perms: ["team.view", "team.edit"] },
      { pay: ["worker"] },
    );
    expect(listRoleOf(paid)?.label).toBe("ניהול");
    const none = rolesFor(
      { role: "manager", perms: ["team.view", "team.edit"] },
      { pay: ["manager", "worker"], named: [] },
    );
    expect(listRoleOf(none)).toBeNull();
  });
});

describe("parsePeopleList: a list from WhatsApp", () => {
  it("reads marks, bullets, numbers before the line and an unsaved contact's ~", () => {
    const parsed = parse(
      [
        `${RLM}~ דנה כהן${LRM}: ${LRM}050-123-4567${LRM}`,
        "• יוסי לוי 052-765-4321",
        "2. מיכל אברהם 054 111 2233",
        "- נועה פרץ - 053-222-3344",
        "3) אבי (058-1234567)",
      ].join("\n"),
    );
    expect(parsed.error).toBeNull();
    expect(persons(parsed)).toEqual([
      worker("דנה כהן", "+972501234567"),
      worker("יוסי לוי", "+972527654321"),
      worker("מיכל אברהם", "+972541112233"),
      worker("נועה פרץ", "+972532223344"),
      worker("אבי", "+972581234567"),
    ]);
  });

  it("leaves out WhatsApp's time, date and sender before each message copied or exported", () => {
    for (const lines of [
      [
        "[10:15, 26.11.2026] אורי בן דוד: דנה כהן 054-710-2201",
        "[10:16, 26.11.2026] אורי בן דוד: יוסי לוי 052-765-4321",
      ],
      [
        "26.11.2026, 10:15 - אורי בן דוד: דנה כהן 054-710-2201",
        "26.11.2026, 10:16 - אורי בן דוד: יוסי לוי 052-765-4321",
      ],
      [
        "[26/11/2026, 10:15:32] Uri: דנה כהן 054-710-2201",
        "11/26/26, 10:16 PM - Uri: יוסי לוי 052-765-4321",
      ],
      // A message of many lines carries it on its first line only.
      [
        "[10:15, 26.11.2026] אורי בן דוד: דנה כהן 054-710-2201",
        "יוסי לוי 052-765-4321",
      ],
    ]) {
      const parsed = parse(lines.join("\n"));
      expect(parsed.error).toBeNull();
      expect(
        people(parsed).map((line) => [line.person.name, line.dropped]),
      ).toEqual([
        ["דנה כהן", []],
        ["יוסי לוי", []],
      ]);
    }
    // The sender's number is never the person's.
    expect(
      problems(parse("[10:15, 26/11/2026] +972 50-123-4567: דנה כהן")),
    ).toEqual([[1, "noPhone"]]);
  });

  it("chooses the cells from most lines, never from a title line first", () => {
    const parsed = parse(
      [
        "צוות הבוקר, יום ראשון:",
        "דנה כהן 050-123-4567",
        "יוסי לוי 052-765-4321",
      ].join("\n"),
    );
    expect(persons(parsed).map((person) => person.name)).toEqual([
      "דנה כהן",
      "יוסי לוי",
    ]);
    expect(problems(parsed)).toEqual([[1, "noPhone"]]);
  });

  it("joins a name line to its number line, as contacts copy them", () => {
    const parsed = parse(
      ["דנה כהן", "050-123-4567", "", "יוסי לוי", "+972 52 765 4321"].join(
        "\n",
      ),
    );
    expect(parsed.people).toBe(2);
    const [first, second] = people(parsed);
    expect([first?.line, first?.last, first?.person.name]).toEqual([
      1,
      2,
      "דנה כהן",
    ]);
    expect([second?.line, second?.last, second?.person.phone]).toEqual([
      4,
      5,
      "+972527654321",
    ]);
  });

  it("joins a name line to its number line under the number's label", () => {
    const parsed = parse(
      [
        "דנה כהן",
        "סלולרי: 050-123-4567",
        "יוסי לוי",
        "Cell: 052-765-4321",
      ].join("\n"),
    );
    expect(parsed.error).toBeNull();
    expect(
      people(parsed).map((line) => [line.line, line.last, line.person.name]),
    ).toEqual([
      [1, 2, "דנה כהן"],
      [3, 4, "יוסי לוי"],
    ]);
  });

  it("joins them the other way round when the number comes first", () => {
    const parsed = parse(
      ["050-123-4567", "דנה כהן", "052-765-4321", "יוסי לוי"].join("\n"),
    );
    expect(
      people(parsed).map((line) => [line.line, line.last, line.person.name]),
    ).toEqual([
      [1, 2, "דנה כהן"],
      [3, 4, "יוסי לוי"],
    ]);
  });

  it("pairs nothing when a line holds both a name and a mobile", () => {
    const parsed = parse(
      ["דנה כהן 050-123-4567", "יוסי לוי", "052-765-4321"].join("\n"),
    );
    expect(parsed.people).toBe(3);
    expect(problems(parsed)).toEqual([
      [2, "noPhone"],
      [3, "noName"],
    ]);
  });

  it("leaves a line of dashes out as nothing to read", () => {
    const parsed = parse(["דנה כהן 050-123-4567", "-----", "***"].join("\n"));
    expect(parsed.error).toBeNull();
    expect(parsed.people).toBe(1);
    expect(parsed.lines.map((line) => line.kind)).toEqual([
      "person",
      "title",
      "title",
    ]);
  });
});

describe("parsePeopleList: phones as typed", () => {
  it.each([
    ["050 123 4567"],
    ["050-1234567"],
    ["+972 50-123-4567"],
    ["972501234567"],
    ["+972 (0)50 123 4567"],
    ["00972 50 123 4567"],
    ["00972501234567"],
    ["٠٥٠١٢٣٤٥٦٧"],
    ["۰۵۰۱۲۳۴۵۶۷"],
  ])("reads %s", (phone) => {
    expect(only(parse(`דנה כהן ${phone}`)).person.phone).toBe("+972501234567");
  });

  it("refuses two numbers in one sheet cell", () => {
    const parsed = parse(
      ["דנה כהן\t050-123-4567 / 052-765-4321", "יוסי לוי\t054-111-2233"].join(
        "\n",
      ),
    );
    expect(problems(parsed)).toEqual([[1, "twoPhones"]]);
    expect(persons(parsed)).toHaveLength(1);
  });

  it("never reads an Israeli mobile from the end of a foreign number", () => {
    for (const number of [
      "+380 50 123 4567",
      "+38 (050) 123-45-67",
      "+38 050 123 45 67",
      "+380 (0)50 123 45 67",
      "+995 555 12 34 56",
      "+994 50 123 45 67",
      "+33 5 12 34 56 78",
      "00380 50 123 4567",
      "0038 050 123 45 67",
      "00 38 050 123 45 67",
      "00380 (0)50 123 45 67",
    ]) {
      // In a sheet's phone column, where Excel's dropped zero is read.
      const sheet = parse(`שם\tנייד\nОлена Петренко\t${number}`);
      expect(problems(sheet)).toEqual([[2, "invalidPhone"]]);
      // Without a header, and in free text, where the name keeps nothing of it.
      expect(problems(parse(`Олена Петренко\t${number}`))).toEqual([
        [1, "invalidPhone"],
      ]);
      const free = parse(`Олена Петренко ${number}`);
      expect(problems(free)).toEqual([[1, "invalidPhone"]]);
      expect(free.lines[0]?.dropped).toEqual([number]);
    }
    // Excel's dropped zero only from a cell's first group.
    expect(problems(parse("שם\tנייד\nדנה\t380 50 123 4567"))).toEqual([
      [2, "invalidPhone"],
    ]);
    // Israel's own code, written either way, still reads.
    expect(only(parse("דנה כהן 00 972 50 123 4567")).person.phone).toBe(
      "+972501234567",
    );
    expect(
      only(parse("שם\tנייד\nדנה כהן\t+972 50 123 4567")).person.phone,
    ).toBe("+972501234567");
  });

  it("reads a mobile after an employee's number with zeros first, and with a stray plus", () => {
    // No country's code of one digit (1, 7) comes before a number with 0
    // first: "001" is the employee's, and goes.
    for (const [text, number] of [
      ["דנה כהן 001 050-1234567", "001"],
      ["דנה כהן 007 050-1234567", "007"],
      ["דנה כהן מס' עובד 001 050-1234567", "001"],
      ["דנה כהן, 001, 050-1234567", "001"],
    ] as const) {
      const line = only(parse(text));
      expect([line.person.name, line.person.phone, line.dropped], text).toEqual(
        ["דנה כהן", "+972501234567", [number]],
      );
    }
    // And no country's code starts with 0.
    for (const [text, phone] of [
      ["דנה כהן +054-1234567", "+972541234567"],
      ["דנה כהן +0527654321", "+972527654321"],
      ["שם\tנייד\nדנה כהן\t+0547102201", "+972547102201"],
    ] as const) {
      expect(only(parse(text)).person.phone, text).toBe(phone);
    }
  });

  it("reads a mobile written with any dash, and keeps a name's own", () => {
    const NB_HYPHEN = String.fromCodePoint(0x2011);
    const LRE = String.fromCodePoint(0x202a);
    const PDF = String.fromCodePoint(0x202c);
    expect(
      only(parse(`דנה כהן: ${LRE}+972 54${NB_HYPHEN}710${NB_HYPHEN}2201${PDF}`))
        .person.phone,
    ).toBe("+972547102201");
    for (const dash of [0x2010, 0x2012, 0x2013, 0x2014, 0x2212]) {
      const mark = String.fromCodePoint(dash);
      expect(only(parse(`דנה כהן 054${mark}710${mark}2201`)).person.phone).toBe(
        "+972547102201",
      );
      expect(only(parse(`דנה כהן 054 ${mark} 7102201`)).person.phone).toBe(
        "+972547102201",
      );
    }
    const contacts = parse(
      [
        "דנה כהן",
        `054${NB_HYPHEN}710${NB_HYPHEN}2201`,
        "יוסי לוי",
        `052${NB_HYPHEN}765${NB_HYPHEN}4321`,
      ].join("\n"),
    );
    expect(
      persons(contacts).map((person) => [person.name, person.phone]),
    ).toEqual([
      ["דנה כהן", "+972547102201"],
      ["יוסי לוי", "+972527654321"],
    ]);
    const EN_DASH = String.fromCodePoint(0x2013);
    expect(only(parse(`Jean${EN_DASH}Pierre 050-123-4567`)).person.name).toBe(
      `Jean${EN_DASH}Pierre`,
    );
  });
});

describe("parsePeopleList: a sheet", () => {
  it("keeps every column in place across an empty first column and an empty cell", () => {
    const parsed = parse(
      [
        "\tדנה\tכהן\t050-123-4567",
        "\tיוסי\t\t052-765-4321",
        "\tמיכל\tאברהם\t054-111-2233",
      ].join("\n"),
    );
    expect(
      persons(parsed).map((person) => [person.name, person.phone]),
    ).toEqual([
      ["דנה כהן", "+972501234567"],
      ["יוסי", "+972527654321"],
      ["מיכל אברהם", "+972541112233"],
    ]);
  });

  it("reads a Hebrew header after the sheet's title, and leaves the ID column out", () => {
    const parsed = parse(
      [
        "עובדי החנות - נובמבר",
        "",
        "שם פרטי\tשם משפחה\tת.ז.\tנייד\tתפקיד",
        "דנה\tכהן\t123456782\t501234567\tניהול",
        "יוסי\tלוי\t012345674\t052-765-4321\t",
      ].join("\n"),
    );
    expect(parsed.header).toBe(true);
    expect(parsed.ignored).toEqual([{ header: "ת.ז." }]);
    expect(parsed.lines.map((line) => [line.line, line.kind])).toEqual([
      [1, "title"],
      [3, "header"],
      [4, "person"],
      [5, "person"],
    ]);
    expect(persons(parsed)).toEqual([
      {
        name: "דנה כהן",
        phone: "+972501234567",
        role: "manager",
        namedRole: null,
        roleFromLine: true,
      },
      worker("יוסי לוי", "+972527654321"),
    ]);
    expect(people(parsed).flatMap((line) => line.dropped)).toEqual([]);
  });

  it("reads an English header, and any header naming a column nobody asked for", () => {
    const parsed = parse(
      [
        "Full name\tMobile\tWage",
        "Dana Cohen\t050-123-4567\t45",
        "Yossi Levi\t052-765-4321\t50",
      ].join("\n"),
    );
    expect(parsed.ignored).toEqual([{ header: "Wage" }]);
    expect(persons(parsed).map((person) => person.name)).toEqual([
      "Dana Cohen",
      "Yossi Levi",
    ]);
  });

  it("takes עובד as the name's header in a header row", () => {
    const parsed = parse(
      ["עובד\tטלפון", "דנה כהן\t050-123-4567", "יוסי לוי\t052-765-4321"].join(
        "\n",
      ),
    );
    expect(parsed.header).toBe(true);
    expect(persons(parsed).map((person) => person.name)).toEqual([
      "דנה כהן",
      "יוסי לוי",
    ]);
  });

  it("finds the phone by most of a column without a header, and names the columns it leaves", () => {
    const parsed = parse(
      [
        "דנה כהן\t123456782\t501234567",
        "יוסי לוי\t012345674\t527654321",
        "מיכל אברהם\t\t0541112233",
      ].join("\n"),
    );
    expect(parsed.header).toBe(false);
    expect(parsed.ignored).toEqual([{ column: 2 }]);
    expect(persons(parsed).map((person) => person.phone)).toEqual([
      "+972501234567",
      "+972527654321",
      "+972541112233",
    ]);
  });

  it("never reads an ID that starts with 5 as the phone when the phone's cell is empty", () => {
    const parsed = parse(
      [
        "דנה כהן\t050-123-4567\t312345678",
        "יוסי לוי\t\t512345678",
        "מיכל אברהם\t054-111-2233\t323456789",
      ].join("\n"),
    );
    expect(problems(parsed)).toEqual([[2, "noPhone"]]);
  });

  it("says Excel's shortened number in the phone column", () => {
    const parsed = parse(
      [
        "דנה כהן\t5.01E+08",
        "יוסי לוי\t052-765-4321",
        "מיכל\t054-111-2233",
      ].join("\n"),
    );
    expect(problems(parsed)).toEqual([[1, "excelNumber"]]);
  });

  it("blocks two phone columns, with headers and without", () => {
    const headed = parse(
      ["שם\tנייד\tטלפון הורה", "דנה כהן\t050-123-4567\t052-765-4321"].join(
        "\n",
      ),
    );
    expect(headed.error).toBe("phoneColumns");
    expect(headed.lines).toEqual([]);
    // The header named them: the screen names them too.
    expect(headed.phoneHeaders).toEqual(["נייד", "טלפון הורה"]);
    const bare = parse(
      [
        "דנה כהן\t050-123-4567\t052-765-4321",
        "יוסי לוי\t054-111-2233\t053-222-3344",
      ].join("\n"),
    );
    expect(bare.error).toBe("phoneColumns");
    expect(bare.phoneHeaders).toBeUndefined();
  });

  it("keeps a department column out of full names", () => {
    const parsed = parse(
      [
        "דנה כהן | 050-123-4567 | מטבח",
        "יוסי לוי | 052-765-4321 | בר",
        "מיכל אברהם | 054-111-2233 | מטבח",
      ].join("\n"),
    );
    expect(persons(parsed).map((person) => person.name)).toEqual([
      "דנה כהן",
      "יוסי לוי",
      "מיכל אברהם",
    ]);
    expect(parsed.ignored).toEqual([{ column: 3 }]);
  });

  it("joins a first-name column and a last-name column of single words", () => {
    const parsed = parse(
      ["דנה\tכהן\t050-123-4567", "יוסי\tלוי\t052-765-4321"].join("\n"),
    );
    expect(persons(parsed).map((person) => person.name)).toEqual([
      "דנה כהן",
      "יוסי לוי",
    ]);
    // Two of three of one family keep their surname too.
    const family = parse(
      [
        "דנה\tלוי\t050-123-4567",
        "יוסי\tלוי\t052-765-4321",
        "מיכל\tכהן\t054-111-2233",
      ].join("\n"),
    );
    expect(persons(family).map((person) => person.name)).toEqual([
      "דנה לוי",
      "יוסי לוי",
      "מיכל כהן",
    ]);
  });

  it("never joins a column of positions into first names", () => {
    // Past the phone: a position or a department, never a surname.
    const after = parse(
      ["דנה\t050-1234567\tקופאית", "יוסי\t052-7654321\tמחסנאי"].join("\n"),
    );
    expect(persons(after).map((person) => person.name)).toEqual([
      "דנה",
      "יוסי",
    ]);
    expect(after.ignored).toEqual([{ column: 3 }]);
    // Beside the name, a column whose words repeat.
    const beside = parse(
      [
        "דנה\tקופאית\t050-123-4567",
        "יוסי\tמחסנאי\t052-765-4321",
        "מיכל\tקופאית\t054-111-2233",
        "נועה\tקופאית\t053-222-3344",
        "אבי\tמחסנאי\t058-123-4567",
      ].join("\n"),
    );
    expect(persons(beside).map((person) => person.name)).toEqual([
      "דנה",
      "יוסי",
      "מיכל",
      "נועה",
      "אבי",
    ]);
    expect(beside.ignored).toEqual([{ column: 2 }]);
  });

  it.each([
    ["שם\tשם משפחה\tנייד", "דנה\tכהן", "יוסי\tלוי"],
    ["שם\tמשפחה\tנייד", "דנה\tכהן", "יוסי\tלוי"],
    ["Name\tSurname\tMobile", "Dana\tCohen", "Yossi\tLevi"],
    ["שם משפחה\tשם\tנייד", "כהן\tדנה", "לוי\tיוסי"],
  ])("joins %s: a first name and its surname", (head, dana, yossi) => {
    const parsed = parse(
      [head, `${dana}\t050-123-4567`, `${yossi}\t052-765-4321`].join("\n"),
    );
    expect(parsed.error).toBeNull();
    expect(parsed.ignored).toEqual([]);
    expect(persons(parsed).map((person) => person.name)).toEqual(
      head.startsWith("Name")
        ? ["Dana Cohen", "Yossi Levi"]
        : ["דנה כהן", "יוסי לוי"],
    );
  });

  it("never adds a surname to a full name", () => {
    const parsed = parse(
      [
        "שם מלא\tשם משפחה\tנייד",
        "דנה כהן\tכהן\t050-123-4567",
        "יוסי לוי\tלוי\t052-765-4321",
      ].join("\n"),
    );
    expect(persons(parsed).map((person) => person.name)).toEqual([
      "דנה כהן",
      "יוסי לוי",
    ]);
    expect(parsed.ignored).toEqual([{ header: "שם משפחה" }]);
  });

  it("reads a name's header in other words, and the one column of words under one nobody listed", () => {
    for (const head of ["עובדים\tטלפון", "השם\tהטלפון", "Staff\tPhone"]) {
      const parsed = parse(
        [head, "דנה כהן\t050-123-4567", "יוסי לוי\t052-765-4321"].join("\n"),
      );
      expect(parsed.header).toBe(true);
      expect(parsed.error).toBeNull();
      expect(persons(parsed).map((person) => person.name)).toEqual([
        "דנה כהן",
        "יוסי לוי",
      ]);
    }
    const unknown = parse(
      ["צוות\tטלפון\tשכר", "דנה כהן\t050-123-4567\t48"].join("\n"),
    );
    expect(only(unknown).person.name).toBe("דנה כהן");
    expect(unknown.ignored).toEqual([{ header: "שכר" }]);
    // Two columns of words, neither named: nothing is guessed.
    const two = parse(
      ["מחלקה\tצוות\tטלפון", "מטבח\tדנה כהן\t050-123-4567"].join("\n"),
    );
    expect(problems(two)).toEqual([[2, "noName"]]);
  });

  it("reads a sheet's one row by its cells, alone or under a line typed above it", () => {
    const row = "דנה כהן\t000000018\t050-1234567\t48";
    const alone = parse(row);
    expect(alone.error).toBeNull();
    expect(only(alone).person).toEqual(worker("דנה כהן", "+972501234567"));
    expect(alone.ignored).toEqual([{ column: 2 }, { column: 4 }]);
    // Excel's dropped zero, as in a column of many rows.
    expect(only(parse("דנה כהן\t501234567\t48")).person.phone).toBe(
      "+972501234567",
    );
    // The line above has no number, and blocks until it goes; the row
    // under it is its cells all the same, the wage never in the name.
    const titled = parse(`עובד חדש\n${row}`);
    expect(problems(titled)).toEqual([[1, "noPhone"]]);
    expect(people(titled).map((line) => line.person.name)).toEqual(["דנה כהן"]);
    expect(titled.ignored).toEqual([{ column: 2 }, { column: 4 }]);
  });

  it("finds the header under a title holding a company's or an ID number", () => {
    const parsed = parse(
      [
        "סופר השכונה בעמ ח.פ. 514789632",
        "שם\tנייד\tתפקיד",
        "דנה כהן\t050-123-4567\t",
        "יוסי לוי\t052-765-4321\t",
      ].join("\n"),
    );
    expect(parsed.error).toBeNull();
    expect(parsed.lines.map((line) => [line.line, line.kind])).toEqual([
      [1, "title"],
      [2, "header"],
      [3, "person"],
      [4, "person"],
    ]);
  });

  it("finds the header under a sheet's title holding a contact's mobile", () => {
    for (const title of [
      "רשימת עובדים - איש קשר: 050-9999999",
      "סופר השכונה, איש קשר: אורי 052-1234567",
    ]) {
      const parsed = parse(
        [
          title,
          "",
          "שם\tנייד",
          "דנה כהן\t0501234567",
          "יוסי לוי\t0527654321",
        ].join("\n"),
      );
      expect(parsed.error).toBeNull();
      expect(parsed.lines.map((line) => [line.line, line.kind])).toEqual([
        [1, "title"],
        [3, "header"],
        [4, "person"],
        [5, "person"],
      ]);
      expect(persons(parsed).map((person) => person.phone)).toEqual([
        "+972501234567",
        "+972527654321",
      ]);
    }
    // A row of cells with a mobile still ends the search: no header under it.
    const rows = parse(
      ["דנה כהן\t050-123-4567", "שם\tנייד", "יוסי לוי\t052-765-4321"].join(
        "\n",
      ),
    );
    expect(rows.header).toBe(false);
  });

  it("marks a title above the header that holds a mobile, and only that one", () => {
    const sheet = ["שם\tנייד", "דנה כהן\t0501234567", "יוסי לוי\t0527654321"];
    const first = (title: string) => {
      const parsed = parse([title, ...sheet].join("\n"));
      // The import still leaves it out: the wizard holds it.
      expect(parsed.error).toBeNull();
      return parsed.lines[0];
    };
    for (const title of [
      "רונית כהן 050-123-4567 בעלים",
      "רשימת עובדים - איש קשר: 050-9999999",
    ]) {
      expect(first(title), title).toMatchObject({
        kind: "title",
        mobile: true,
      });
    }
    for (const title of ["צוות הסניף", "סופר השכונה בעמ ח.פ. 514789632"]) {
      const line = first(title);
      expect(line?.kind, title).toBe("title");
      expect(line, title).not.toHaveProperty("mobile");
    }
  });

  it("takes the person's name column, never one that names a branch, a department, a manager, a father or a user", () => {
    const sheet = (...rows: string[][]) =>
      parse(rows.map((cells) => cells.join("\t")).join("\n"));
    const names = (parsed: ParsedPeople) =>
      persons(parsed).map((person) => person.name);
    for (const [other, name] of [
      ["שם הסניף", "שם העובד"],
      ["Branch name", "Employee name"],
      ["שם מנהל", "שם עובד"],
      ["שם מחלקה", "שם עובד"],
      ["Username", "Name"],
      ["שם הסניף", "שם העובד המלא"],
    ] as const) {
      // Before the person's name column and after it.
      const before = sheet(
        [other, name, "נייד"],
        ["תל אביב", "דנה כהן", "050-123-4567"],
        ["חיפה", "יוסי לוי", "052-765-4321"],
      );
      const after = sheet(
        [name, other, "נייד"],
        ["דנה כהן", "תל אביב", "050-123-4567"],
        ["יוסי לוי", "חיפה", "052-765-4321"],
      );
      for (const parsed of [before, after]) {
        expect(names(parsed)).toEqual(["דנה כהן", "יוסי לוי"]);
        expect(parsed.ignored).toEqual([{ header: other }]);
      }
    }
    // A father's name beside first and last names, which are joined.
    const father = sheet(
      ["שם פרטי", "שם משפחה", "שם האב", "נייד"],
      ["דנה", "כהן", "משה", "050-123-4567"],
      ["יוסי", "לוי", "דוד", "052-765-4321"],
    );
    expect(names(father)).toEqual(["דנה כהן", "יוסי לוי"]);
    expect(father.ignored).toEqual([{ header: "שם האב" }]);
    // A role's name is the role column: its job titles left out.
    const role = sheet(
      ["שם פרטי", "שם משפחה", "שם תפקיד", "נייד"],
      ["דנה", "כהן", "קופאית", "050-123-4567"],
      ["יוסי", "לוי", "ניהול", "052-765-4321"],
    );
    expect(
      people(role).map((line) => [
        line.person.name,
        line.person.role,
        line.dropped,
      ]),
    ).toEqual([
      ["דנה כהן", "worker", ["קופאית"]],
      ["יוסי לוי", "manager", []],
    ]);
    expect(role.ignored).toEqual([]);
    // "Role name" too, while a name and a role together is the name's.
    const roleName = sheet(
      ["Name", "Role name", "Phone"],
      ["דנה כהן", "ניהול", "050-123-4567"],
    );
    expect(
      people(roleName).map((line) => [line.person.name, line.person.role]),
    ).toEqual([["דנה כהן", "manager"]]);
    for (const together of [
      "שם / תפקיד",
      "Name / Role",
      "Name (Role)",
      "שם + תפקיד",
    ]) {
      const parsed = sheet(
        [together, "נייד"],
        ["דנה כהן", "050-123-4567"],
        ["יוסי לוי", "052-765-4321"],
      );
      expect(names(parsed), together).toEqual(["דנה כהן", "יוסי לוי"]);
      expect(parsed.error, together).toBeNull();
    }
  });

  it("keeps a full name in other words beside a first name alone, and joins first and last beside it", () => {
    const sheet = (...rows: string[][]) =>
      parse(rows.map((cells) => cells.join("\t")).join("\n"));
    const names = (parsed: ParsedPeople) =>
      persons(parsed).map((person) => person.name);
    for (const [full, first] of [
      ["שם העובד המלא", "שם פרטי"],
      ["Employee full name", "First name"],
    ] as const) {
      // Before the first name's column and after it.
      for (const parsed of [
        sheet([full, first, "נייד"], ["דנה כהן", "דנה", "050-123-4567"]),
        sheet([first, full, "נייד"], ["דנה", "דנה כהן", "050-123-4567"]),
      ]) {
        expect(names(parsed), full).toEqual(["דנה כהן"]);
        expect(parsed.ignored, full).toEqual([{ header: first }]);
      }
    }
    // With a last name's column too, the two are the name.
    const nickname = sheet(
      ["Nickname", "First name", "Last name", "Phone"],
      ["DD", "Dana", "Cohen", "050-123-4567"],
    );
    expect(names(nickname)).toEqual(["Dana Cohen"]);
    expect(nickname.ignored).toEqual([{ header: "Nickname" }]);
    // "שם המשפחה" and "השם הפרטי" are the last and the first name.
    for (const parsed of [
      sheet(["שם המשפחה", "שם פרטי", "נייד"], ["כהן", "דנה", "050-123-4567"]),
      sheet(["השם הפרטי", "שם המשפחה", "נייד"], ["דנה", "כהן", "050-123-4567"]),
    ]) {
      expect(names(parsed)).toEqual(["דנה כהן"]);
      expect(parsed.ignored).toEqual([]);
    }
  });

  it("never joins a column of sums to first names", () => {
    const parsed = parse(
      ['דנה\t45ש"ח\t050-123-4567', 'יוסי\t38ש"ח\t052-765-4321'].join("\n"),
    );
    expect(persons(parsed).map((person) => person.name)).toEqual([
      "דנה",
      "יוסי",
    ]);
    expect(parsed.ignored).toEqual([{ column: 2 }]);
  });

  it("never takes a first line for the header for its name טל", () => {
    for (const lines of [
      ["טל, 03-1234567", "דנה כהן, 050-123-4567", "יוסי לוי, 052-765-4321"],
      [
        "טל\tכהן\t5.01E+08",
        "דנה\tלוי\t050-123-4567",
        "יוסי\tאברהם\t052-765-4321",
      ],
      ["טל", "דנה כהן, 050-123-4567", "יוסי לוי, 052-765-4321"],
    ]) {
      const parsed = parse(lines.join("\n"));
      expect(parsed.header).toBe(false);
      expect(problems(parsed).map(([line]) => line)).toEqual([1]);
      expect(persons(parsed).map((person) => person.phone)).toEqual([
        "+972501234567",
        "+972527654321",
      ]);
    }
    // Beside another header, it names the phone's column.
    const headed = parse(
      ["שם\tטל", "דנה כהן\t050-123-4567", "יוסי לוי\t052-765-4321"].join("\n"),
    );
    expect(headed.header).toBe(true);
    expect(persons(headed)).toHaveLength(2);
  });

  it("reads the headed column of mobiles beside a headed one of landlines, or an empty one", () => {
    const landlines = parse(
      [
        "שם\tטלפון\tטלפון נייד",
        "דנה כהן\t03-1234567\t050-123-4567",
        "יוסי לוי\t\t052-765-4321",
      ].join("\n"),
    );
    expect(landlines.error).toBeNull();
    expect(landlines.ignored).toEqual([{ header: "טלפון" }]);
    expect(persons(landlines).map((person) => person.phone)).toEqual([
      "+972501234567",
      "+972527654321",
    ]);
    const empty = parse(
      ["שם\tנייד\tטלפון בית", "דנה כהן\t050-123-4567\t"].join("\n"),
    );
    expect(only(empty).person.phone).toBe("+972501234567");
    expect(empty.ignored).toEqual([{ header: "טלפון בית" }]);
  });
});

describe("parsePeopleList: CSV", () => {
  it("reads a quoted cell with a comma in it, and a doubled quote", () => {
    const parsed = parse(
      ['"כהן, דנה",050-123-4567', '"דנה ""הגדולה"" לוי",052-765-4321'].join(
        "\n",
      ),
    );
    expect(persons(parsed).map((person) => person.name)).toEqual([
      "כהן, דנה",
      'דנה "הגדולה" לוי',
    ]);
  });

  it('keeps an unquoted אחמ"ש as typed, a role', () => {
    const parsed = parse(
      ['דנה כהן,050-123-4567,אחמ"ש', "יוסי לוי,052-765-4321,"].join("\n"),
    );
    expect(persons(parsed).map((person) => person.role)).toEqual([
      "manager",
      "worker",
    ]);
  });

  it("reads a line whose quote never closed as free text", () => {
    const parsed = parse(
      ['"דנה כהן,050-123-4567', "יוסי לוי,052-765-4321"].join("\n"),
    );
    expect(persons(parsed).map((person) => person.name)).toEqual([
      "דנה כהן",
      "יוסי לוי",
    ]);
  });

  it.each([
    [
      "a line with no comma",
      [
        "דנה כהן, 050-1234567",
        "יוסי לוי, 052-7654321",
        "מיכל אברהם 054-1112233",
      ],
    ],
    [
      "the number first",
      [
        "דנה כהן, 050-1234567",
        "052-7654321, יוסי לוי",
        "מיכל אברהם, 054-1112233",
      ],
    ],
    [
      "a dash list with the number first",
      [
        "דנה כהן - 050-1234567",
        "יוסי לוי - 052-7654321",
        "054-1112233 - מיכל אברהם",
      ],
    ],
  ])("reads a list typed by hand with %s", (_, lines) => {
    const parsed = parse(lines.join("\n"));
    expect(parsed.error).toBeNull();
    expect(
      persons(parsed).map((person) => [person.name, person.phone]),
    ).toEqual([
      ["דנה כהן", "+972501234567"],
      ["יוסי לוי", "+972527654321"],
      ["מיכל אברהם", "+972541112233"],
    ]);
    expect(people(parsed).flatMap((line) => line.dropped)).toEqual([]);
  });

  it("finds one phone column in a list typed by hand with a role on one line", () => {
    const parsed = parse(
      [
        "דנה כהן, ניהול, 050-1234567",
        "יוסי לוי, 052-7654321",
        "מיכל, 054-1112233",
      ].join("\n"),
    );
    expect(parsed.error).toBeNull();
    expect(parsed.ignored).toEqual([]);
    expect(persons(parsed).map((person) => [person.name, person.role])).toEqual(
      [
        ["דנה כהן", "manager"],
        ["יוסי לוי", "worker"],
        ["מיכל", "worker"],
      ],
    );
    // A bare 5… on a line typed by hand is still no mobile.
    const id = parse(
      [
        "דנה כהן, 050-1234567",
        "יוסי לוי, 052-7654321",
        "מיכל, , 512345678",
      ].join("\n"),
    );
    expect(problems(id)).toEqual([[3, "noPhone"]]);
  });

  it("never takes a person's phone from a second column of mobiles filled on some lines", () => {
    const parsed = parse(
      [
        "דנה כהן, 050-1111111, 052-9999991",
        "יוסי לוי, 050-2222222,",
        "מיכל אברהם, , 052-9999993",
        "רון גל, 050-4444444,",
        "שירה בר, 050-5555555,",
      ].join("\n"),
    );
    expect(parsed.error).toBe("phoneColumns");
    expect(parsed.lines).toEqual([]);
    // With every line's own mobile in its place, the second one is left
    // out and nothing blocks.
    const beside = parse(
      [
        "דנה כהן, 050-1111111, 052-9999991",
        "יוסי לוי, 050-2222222",
        "מיכל אברהם, 050-3333333",
        "רון גל, 050-4444444",
        "שירה בר, 050-5555555",
      ].join("\n"),
    );
    expect(beside.error).toBeNull();
    expect(beside.ignored).toEqual([{ column: 3 }]);
    expect(
      persons(beside).map((person) => [person.name, person.phone]),
    ).toEqual([
      ["דנה כהן", "+972501111111"],
      ["יוסי לוי", "+972502222222"],
      ["מיכל אברהם", "+972503333333"],
      ["רון גל", "+972504444444"],
      ["שירה בר", "+972505555555"],
    ]);
  });

  it("chooses ; over , when more lines hold it", () => {
    const parsed = parse(
      [
        "כהן, דנה;050-123-4567;ניהול",
        "לוי יוסי;052-765-4321;",
        "אברהם מיכל;054-111-2233;צוות",
      ].join("\n"),
    );
    expect(persons(parsed).map((person) => [person.name, person.role])).toEqual(
      [
        ["כהן, דנה", "manager"],
        ["לוי יוסי", "worker"],
        ["אברהם מיכל", "worker"],
      ],
    );
  });
});

describe("parsePeopleList: free text", () => {
  it("splits a mobile from the ID beside it, and drops the ID", () => {
    const line = only(parse("דנה כהן 050-1234567 123456782"));
    expect(line.person).toEqual(worker("דנה כהן", "+972501234567"));
    expect(line.dropped).toEqual(["123456782"]);
  });

  it("refuses two mobiles", () => {
    expect(problems(parse("דנה כהן 050-1234567, 052-7654321"))).toEqual([
      [1, "twoPhones"],
    ]);
  });

  it("refuses a bare 9-digit number starting with 5, which may be an ID", () => {
    expect(problems(parse("דנה כהן 501234567"))).toEqual([[1, "invalidPhone"]]);
  });

  it("refuses a landline and a foreign number", () => {
    expect(problems(parse("דנה כהן 03-1234567"))).toEqual([
      [1, "invalidPhone"],
    ]);
    expect(problems(parse("Anna +44 20 7946 0958"))).toEqual([
      [1, "invalidPhone"],
    ]);
  });

  it("says Excel's shortened number", () => {
    const parsed = parse("דנה כהן 5.01E+08");
    expect(problems(parsed)).toEqual([[1, "excelNumber"]]);
    expect(parsed.lines[0]?.dropped).toEqual(["5.01E+08"]);
  });

  it("keeps the ID, a landline and the separators out of the name", () => {
    const line = only(
      parse("דנה כהן - 050-123-4567, ת.ז 123456782; בית 03-1234567 | נ"),
    );
    expect(line.person.name).toBe("דנה כהן בית נ");
    expect(line.dropped).toEqual(["123456782", "03-1234567"]);
  });

  it("takes a number's label out of the name with it, but never a name like טל", () => {
    const parsed = parse(
      [
        'דנה כהן נייד: 050-123-4567 ת"ז 123456782',
        "טל 052-765-4321 טל' 03-1234567",
        "Dana Cohen ID: 123456782 mobile 054-111-2233",
      ].join("\n"),
    );
    expect(persons(parsed).map((person) => person.name)).toEqual([
      "דנה כהן",
      "טל",
      "Dana Cohen",
    ]);
    const more = parse(
      [
        "דנה כהן סלולרי: 050-123-4567",
        "יוסי לוי מס' טלפון 052-765-4321",
        "Dana Levi Cell: 054-111-2233",
        "מיכל אברהם מספר נייד 053-222-3344",
      ].join("\n"),
    );
    expect(persons(more).map((person) => person.name)).toEqual([
      "דנה כהן",
      "יוסי לוי",
      "Dana Levi",
      "מיכל אברהם",
    ]);
    // "שכר" alone is a surname: a wage's label only with a colon or "לשעה".
    const surname = only(parse("דוד שכר 050-1234567"));
    expect([surname.person.name, surname.dropped]).toEqual(["דוד שכר", []]);
  });

  it("takes a list's number off the name, with a space or a spaced dash", () => {
    const parsed = parse(
      [
        "1 דנה כהן 050-123-4567",
        "12 - יוסי לוי 052-765-4321",
        "054 111 2233 מיכל אברהם",
      ].join("\n"),
    );
    expect(parsed.error).toBeNull();
    expect(
      persons(parsed).map((person) => [person.name, person.phone]),
    ).toEqual([
      ["דנה כהן", "+972501234567"],
      ["יוסי לוי", "+972527654321"],
      ["מיכל אברהם", "+972541112233"],
    ]);
  });

  it("drops a date and a run of 5 digits beside it, and keeps a short number", () => {
    const line = only(parse("דנה כהן 2 050-123-4567 1.1.2020 12345"));
    expect(line.person.name).toBe("דנה כהן 2");
    expect(line.dropped).toEqual(["1.1.2020 12345"]);
  });

  it("drops a wage, a year, an age and an ID's check digit, never keeping them in the name", () => {
    for (const [text, name, dropped] of [
      ["דנה כהן 050-1234567 45", "דנה כהן", ["45"]],
      ["דנה כהן 050-1234567 2", "דנה כהן", ["2"]],
      ["דנה כהן 054-1112233 38.5", "דנה כהן", ["38.5"]],
      ["דנה כהן 052-7654321 ₪7.200", "דנה כהן", ["₪7.200"]],
      ["דנה כהן 0501234567 שכר: 45", "דנה כהן", ["45"]],
      ["דנה כהן 0501234567 שכר לשעה 45", "דנה כהן", ["45"]],
      ["דנה כהן 1990 050-1234567", "דנה כהן", ["1990"]],
      ["דנה כהן מס' עובד 12 050-1234567", "דנה כהן", ["12"]],
      ["דנה כהן (17) 050-1234567", "דנה כהן", ["17)"]],
      ["דנה כהן ת.ז 12345678/2 050-1234567", "דנה כהן", ["12345678", "2"]],
      ["דנה כהן דרכון PA1234567 050-1234567", "דנה כהן", ["1234567"]],
      ["Dana Cohen passport: X1234567 050-1234567", "Dana Cohen", ["1234567"]],
    ] as const) {
      const line = only(parse(text));
      expect(line.person.name, text).toBe(name);
      expect(line.dropped, text).toEqual(dropped);
    }
    // A line typed by hand, alone or among others read by their cells.
    for (const text of [
      "יוסי לוי, 123456782, 052-7654321, 38",
      "יוסי לוי | 123456782 | 052-7654321 | 38",
    ]) {
      expect(only(parse(text)).person.name).toBe("יוסי לוי");
    }
    const typed = parse(
      [
        "דנה, 052-1111111, 40",
        "יוסי לוי, 24, 052-2222222",
        "מיכל, 052-3333333, 30",
      ].join("\n"),
    );
    expect(persons(typed).map((person) => person.name)).toEqual([
      "דנה",
      "יוסי לוי",
      "מיכל",
    ]);
  });
});

describe("parsePeopleList: names", () => {
  it("drops what nobody sees, and composes letters", () => {
    const line = only(parse(`Rene${ACUTE}e${ZERO_WIDTH} Dubois 050-123-4567`));
    expect(line.person.name).toBe(`Ren${String.fromCodePoint(0xe9)}e Dubois`);
  });

  it("takes 80 characters, by code point, and refuses 81", () => {
    const name = (length: number) => `${"א".repeat(length - 3)} 𝒜𝒜`;
    expect(only(parse(`${name(80)} 050-123-4567`)).person.name).toBe(name(80));
    expect(problems(parse(`${name(81)} 050-123-4567`))).toEqual([
      [1, "nameTooLong"],
    ]);
  });

  it("reads names in Arabic, Russian and Amharic", () => {
    const parsed = parse(
      [
        "محمد خليل 050-123-4567",
        "Анна Петрова 052-765-4321",
        "አበበ ቢቂላ 054-111-2233",
      ].join("\n"),
    );
    expect(persons(parsed).map((person) => person.name)).toEqual([
      "محمد خليل",
      "Анна Петрова",
      "አበበ ቢቂላ",
    ]);
  });

  it("keeps a Hebrew name and an English one on the next line apart", () => {
    const parsed = parse(
      ["דנה כהן 050-123-4567", "Dana Cohen 052-765-4321"].join("\n"),
    );
    expect(persons(parsed).map((person) => person.name)).toEqual([
      "דנה כהן",
      "Dana Cohen",
    ]);
  });

  it("refuses a line copied backwards from a PDF, never turning it around", () => {
    const parsed = parse("ןהכ הנד 050-123-4567");
    expect(problems(parsed)).toEqual([[1, "reversed"]]);
    expect(problemAt(parsed, 1).phone).toBe("+972501234567");
  });

  it("needs a name", () => {
    expect(problems(parse("050-123-4567"))).toEqual([[1, "noName"]]);
  });

  it("keeps an initial's dot and a geresh at the end", () => {
    const parsed = parse(
      ["שירן א. 050-123-4567", "ג׳ורג׳ 052-765-4321"].join("\n"),
    );
    expect(persons(parsed).map((person) => person.name)).toEqual([
      "שירן א.",
      "ג׳ורג׳",
    ]);
  });
});

describe("parsePeopleList: roles", () => {
  it("reads the business's own word for a role", () => {
    const line = only(parse("דנה כהן 050-123-4567 ניהול"));
    expect([
      line.person.role,
      line.person.roleFromLine,
      line.roleLabel,
    ]).toEqual(["manager", true, "ניהול"]);
  });

  it("reads a named role in Hebrew and in English", () => {
    const parsed = parse(
      ["דנה כהן 050-123-4567 מארחת", "Dana Cohen 052-765-4321 host"].join("\n"),
    );
    expect(
      persons(parsed).map((person) => [person.role, person.namedRole]),
    ).toEqual([
      ["worker", HOST_ID],
      ["worker", HOST_ID],
    ]);
  });

  it("reads a two-word named role at the end and at the start", () => {
    const parsed = parse(
      [
        "דנה כהן 050-123-4567 אחראי משמרת",
        "אחראי משמרת: יוסי לוי 052-765-4321",
      ].join("\n"),
    );
    expect(
      persons(parsed).map((person) => [person.name, person.namedRole]),
    ).toEqual([
      ["דנה כהן", SHIFT_LEAD_ID],
      ["יוסי לוי", SHIFT_LEAD_ID],
    ]);
  });

  it('reads the role first ("מנהלת: דנה כהן"), and "מנהל/ת"', () => {
    const parsed = parse(
      ["מנהלת: דנה כהן 050-123-4567", "יוסי לוי 052-765-4321 מנהל/ת"].join(
        "\n",
      ),
    );
    expect(persons(parsed).map((person) => [person.name, person.role])).toEqual(
      [
        ["דנה כהן", "manager"],
        ["יוסי לוי", "manager"],
      ],
    );
  });

  it("holds an accountant and an owner for one by one", () => {
    const parsed = parse(
      [
        "דנה כהן 050-123-4567 מנהלת חשבונות",
        "יוסי לוי 052-765-4321 בעלים",
      ].join("\n"),
    );
    expect(problems(parsed)).toEqual([
      [1, "oneByOne"],
      [2, "oneByOne"],
    ]);
    expect(problemAt(parsed, 1).roleLabel).toBe("הנהלת חשבונות");
    expect(problemAt(parsed, 2).roleLabel).toBe("בעלים");
  });

  it("holds a role above the viewer's rank, one that holds pay, and one held", () => {
    expect(problems(parse("דנה כהן 050-123-4567 מנהל", EDITOR))).toEqual([
      [1, "notAllowed"],
    ]);
    expect(problems(parse("דנה כהן 050-123-4567 ניהול", EDITOR))).toEqual([
      [1, "notAllowed"],
    ]);
    const paid = rolesFor(
      { role: "manager", perms: ["team.view", "team.edit"] },
      { pay: ["worker"] },
    );
    expect(problems(parse("דנה כהן 050-123-4567 עובדת", paid))).toEqual([
      [1, "givesPay"],
    ]);
    expect(problems(parse("דנה כהן 050-123-4567 אחראי משמרת", EDITOR))).toEqual(
      [[1, "held"]],
    );
  });

  it("reads an owner's and a shift lead's two words, and a business's own role of that name first", () => {
    const owner = parse("רונית כהן 050-123-4567 בעלת העסק");
    expect(problems(owner)).toEqual([[1, "oneByOne"]]);
    expect(problemAt(owner, 1)).toMatchObject({
      name: "רונית כהן",
      roleLabel: "בעלים",
      role: "owner",
    });
    // Where the business names no such role, a shift lead is a manager, as
    // אחמ"ש is.
    const plain = rolesFor({ role: "owner", perms: [] }, { named: [] });
    const lead = only(parse("דנה כהן 050-123-4567 מנהל משמרת", plain));
    expect([lead.person.name, lead.person.role, lead.person.namedRole]).toEqual(
      ["דנה כהן", "manager", null],
    );
    // A role the business named so, above the viewer's rank, is refused by
    // its own name, not the built-in manager's.
    const above: GivableNamedRole = {
      id: "6a0e4f1c-6c51-4d8e-9a7b-2f0f6c1d3e03",
      name: "מנהל משמרת",
      nameEn: null,
      base: "manager",
      holds: [],
    };
    const editor = rolesFor(
      { role: "worker", perms: ["team.view", "team.edit"] },
      { named: [above] },
    );
    expect(
      problemAt(parse("דנה כהן 050-123-4567 מנהל משמרת", editor), 1),
    ).toMatchObject({ problem: "notAllowed", roleLabel: "מנהל משמרת" });
  });

  it("leaves a job title in a role column out, with the list's role, and keeps it in a free-text name", () => {
    const sheet = parse(
      [
        "שם\tנייד\tתפקיד",
        "דנה כהן\t050-123-4567\tקופאית",
        "יוסי לוי\t052-765-4321\t",
        "מיכל אברהם\t054-111-2233\tמנהלת סניף",
        "נועה פרץ\t053-222-3344\tניהול",
      ].join("\n"),
    );
    expect(sheet.error).toBeNull();
    expect(
      people(sheet).map((line) => [
        line.person.name,
        line.person.role,
        line.person.roleFromLine,
        line.dropped,
      ]),
    ).toEqual([
      ["דנה כהן", "worker", false, ["קופאית"]],
      ["יוסי לוי", "worker", false, []],
      ["מיכל אברהם", "worker", false, ["מנהלת סניף"]],
      ["נועה פרץ", "manager", true, []],
    ]);
    // A role the viewer can't give from a list still stops its line.
    const owner = parse(
      [
        "שם\tנייד\tתפקיד",
        "דנה כהן\t050-123-4567\tבעלים",
        "יוסי לוי\t052-765-4321\tמחסנאי",
      ].join("\n"),
    );
    expect(problems(owner)).toEqual([[2, "oneByOne"]]);
    expect(only(parse("דנה כהן קופאית 050-123-4567")).person.name).toBe(
      "דנה כהן קופאית",
    );
  });

  it("never reads a role named like a first name or a surname off a name", () => {
    const named = (id: string, name: string, base: "manager" | "worker") => ({
      id: `6a0e4f1c-6c51-4d8e-9a7b-2f0f6c1d3e${id}`,
      name,
      nameEn: null,
      base,
      holds: [],
    });
    const roles = rolesFor(
      { role: "owner", perms: [] },
      {
        named: [
          named("11", "בר", "manager"),
          named("12", "ברמן", "worker"),
          named("13", "טבח", "manager"),
        ],
      },
    );
    for (const [text, name] of [
      ["בר כהן 054-710-2201", "בר כהן"],
      ["בר כהן\t054-710-2201", "בר כהן"],
      ["דנה ברמן 054-710-2201", "דנה ברמן"],
      ["יוסי טבח 054-710-2201", "יוסי טבח"],
      ["יוסי טבח, 054-710-2201", "יוסי טבח"],
      ["שירה בר, 054-710-2201", "שירה בר"],
      ["ברמן דנה כהן 054-710-2201", "ברמן דנה כהן"],
    ] as const) {
      const line = only(parse(text, roles));
      expect([line.person.name, line.person.roleFromLine], text).toEqual([
        name,
        false,
      ]);
    }
    // Parted from the name, or after a name of two words, it is the role.
    for (const text of [
      "דנה 054-710-2201 בר",
      "בר: דנה כהן 054-710-2201",
      "דנה כהן בר 054-710-2201",
      "דנה כהן, 054-710-2201, טבח",
    ]) {
      const line = only(parse(text, roles));
      expect(
        [line.person.role, line.person.roleFromLine, line.notes],
        text,
      ).toEqual(["manager", true, []]);
    }
    // A built-in role's word beside them is no name, and still read.
    const manager = only(parse("דנה מנהלת 054-710-2201", roles));
    expect([manager.person.name, manager.person.role]).toEqual([
      "דנה",
      "manager",
    ]);
    // A role's name and a number, and nothing else, is no name.
    expect(problems(parse("ניהול 050-123-4567"))).toEqual([[1, "noName"]]);
  });

  it("reads a built-in role's word and a role of two words at either end of a name, one word long too", () => {
    for (const [text, name, label] of [
      ["דנה ניהול 050-1234567", "דנה", "ניהול"],
      ["ניהול דנה כהן 050-1234567", "דנה כהן", "ניהול"],
      ["מנהלת דנה כהן 050-1234567", "דנה כהן", "ניהול"],
      ["דנה מנהלת 050-1234567", "דנה", "ניהול"],
      ["050-1234567 דנה ניהול", "דנה", "ניהול"],
      ["דנה אחראי משמרת 050-1234567", "דנה", "אחראי משמרת"],
      ["אחראי משמרת דנה כהן 050-1234567", "דנה כהן", "אחראי משמרת"],
    ] as const) {
      const line = only(parse(text));
      expect(
        [line.person.name, line.roleLabel, line.person.roleFromLine],
        text,
      ).toEqual([name, label, true]);
    }
    for (const text of ["דנה בעלים 050-1234567", "בעלים דנה כהן 050-1234567"]) {
      expect(problems(parse(text)), text).toEqual([[1, "oneByOne"]]);
    }
    // A worker's word on a list given managers: the line's role, and its
    // "עובד" before the number is no number's label.
    const manager = OWNER.choices.find(
      (choice) => choice.role === "manager" && choice.namedRole === null,
    );
    if (!manager) throw new Error("No manager");
    for (const [text, name] of [
      ["דנה כהן עובד 050-1234567", "דנה כהן"],
      ["דנה כהן, עובד, 050-1234567", "דנה כהן"],
      ["דנה עובדת 050-1234567", "דנה"],
      ["צוות דנה כהן 050-1234567", "דנה כהן"],
    ] as const) {
      const line = parsePeopleList(text, OWNER, manager).lines[0];
      expect(line?.kind === "person" && line.person, text).toEqual({
        name,
        phone: "+972501234567",
        role: "worker",
        namedRole: null,
        roleFromLine: true,
      });
    }
  });

  it("gives a line with no role the list's role, not from the line", () => {
    const roles = MANAGER;
    const manager = roles.choices.find(
      (choice) => choice.role === "manager" && choice.namedRole === null,
    );
    if (!manager) throw new Error("No manager");
    const line = parsePeopleList("דנה כהן 050-123-4567", roles, manager);
    expect(line.lines[0]?.kind === "person" && line.lines[0].person).toEqual({
      name: "דנה כהן",
      phone: "+972501234567",
      role: "manager",
      namedRole: null,
      roleFromLine: false,
    });
  });
});

describe("parsePeopleList: duplicates and notes", () => {
  it("leaves out the same person twice, and refuses the same number with another name", () => {
    const parsed = parse(
      [
        "דנה כהן 050-123-4567",
        "דנה כהן 0501234567",
        "דנה לוי 050-123-4567",
        "דנה כהן 050-123-4567 ניהול",
      ].join("\n"),
    );
    expect(parsed.lines.map((line) => line.kind)).toEqual([
      "person",
      "sameLine",
      "problem",
      "problem",
    ]);
    expect(problemAt(parsed, 3)).toMatchObject({
      problem: "duplicate",
      first: 1,
      phone: "+972501234567",
    });
    expect(parsed.lines[1]).toMatchObject({ kind: "sameLine", first: 1 });
    expect(problemAt(parsed, 3).name).toBe("דנה לוי");
  });

  it("leaves out the same person twice when one line writes the list's role, and sends that role as written", () => {
    // Two lists merged, one with a role column and one without.
    for (const text of [
      ["דנה כהן 050-123-4567", "דנה כהן 050-123-4567 צוות"],
      ["דנה כהן 050-123-4567 צוות", "דנה כהן 050-123-4567"],
    ]) {
      const parsed = parse(text.join("\n"));
      expect(parsed.lines.map((line) => line.kind)).toEqual([
        "person",
        "sameLine",
      ]);
      expect(parsed.error).toBeNull();
      expect(only(parsed).person).toEqual({
        ...worker("דנה כהן", "+972501234567"),
        roleFromLine: true,
      });
      // An invite waiting as a manager takes the role a line wrote.
      expect(
        outcomes(
          text.join("\n"),
          team([invite({ phone: "+972501234567", role: "manager" })]),
        ),
      ).toEqual(["updateRole", undefined]);
    }
  });

  it("compares names case aside the same in every device's language", () => {
    // Turkish lowers "I" to "ı": a device in Turkish reads the same.
    const turkish = vi
      .spyOn(String.prototype, "toLocaleLowerCase")
      .mockImplementation(function (this: string) {
        return this.replace(/I/g, "ı").toLowerCase();
      });
    try {
      const parsed = parse(
        ["IDAN COHEN 050-123-4567", "idan cohen 050-123-4567"].join("\n"),
      );
      expect(parsed.lines.map((line) => line.kind)).toEqual([
        "person",
        "sameLine",
      ]);
    } finally {
      turkish.mockRestore();
    }
  });

  it("notes the same name with another number, on both lines", () => {
    const parsed = parse(
      ["דנה כהן 050-123-4567", "דנה כהן 052-765-4321"].join("\n"),
    );
    expect(people(parsed).map((line) => line.notes)).toEqual([
      [{ kind: "sameNameList", line: 2 }],
      [{ kind: "sameNameList", line: 1 }],
    ]);
  });

  it("notes the same last word in 3 names and a tenth of the list", () => {
    const lines = [
      "דנה כהן ברמנית 050-000-0001",
      "מיכל לוי ברמנית 050-000-0002",
      "נועה פרץ ברמנית 050-000-0003",
      ...Array.from(
        { length: 27 },
        (_, i) =>
          `${"אבגדהוזחטיכלמנסעפצקרשת"[i % 22]}ן 050-000-${String(i + 10).padStart(4, "0")}`,
      ),
    ];
    const parsed = parse(lines.join("\n"));
    expect(parsed.people).toBe(30);
    const noted = people(parsed).filter((line) =>
      line.notes.some((note) => note.kind === "trailingWord"),
    );
    expect(noted.map((line) => line.line)).toEqual([1, 2, 3]);
    expect(noted[0]?.notes).toContainEqual({
      kind: "trailingWord",
      word: "ברמנית",
      count: 3,
    });
    // Under a tenth of the list, it is just a name.
    const longer = parse(
      [
        ...lines,
        ...Array.from(
          { length: 2 },
          (_, i) => `ת${"אבג"[i]} 050-000-${String(i + 50).padStart(4, "0")}`,
        ),
      ].join("\n"),
    );
    expect(
      people(longer).some((line) =>
        line.notes.some((note) => note.kind === "trailingWord"),
      ),
    ).toBe(false);
  });
});

/** `count` made-up people, one a line, numbers 050-1xx-xxxx. */
const list = (count: number) =>
  Array.from(
    { length: count },
    (_, i) =>
      `${"אבגדהוזחטי"[i % 10]}${"אבגדהוזחטי"[Math.floor(i / 10) % 10]}${"אבגדהוזחטי"[Math.floor(i / 100) % 10]} 05${String(1000000 + i).padStart(8, "0")}`,
  ).join("\n");

describe("parsePeopleList: caps", () => {
  it(`reads ${PEOPLE_IMPORT_MAX} people and refuses one more, drawing none`, () => {
    const most = parse(list(PEOPLE_IMPORT_MAX));
    expect(most.error).toBeNull();
    expect(most.people).toBe(PEOPLE_IMPORT_MAX);
    const over = parse(list(PEOPLE_IMPORT_MAX + 1));
    expect(over.error).toBe("tooMany");
    expect(over.people).toBe(PEOPLE_IMPORT_MAX + 1);
    expect(over.lines).toEqual([]);
  });

  it("counts 5,000 lines quickly and draws no row", () => {
    const started = performance.now();
    const parsed = parse(list(5000));
    expect(performance.now() - started).toBeLessThan(3000);
    expect(parsed.error).toBe("tooMany");
    expect(parsed.people).toBe(5000);
    expect(parsed.lines).toEqual([]);
  });

  it(`reads nothing past ${PEOPLE_IMPORT_CHARS} characters`, () => {
    const parsed = parse("א".repeat(PEOPLE_IMPORT_CHARS + 1));
    expect(parsed).toEqual({
      lines: [],
      header: false,
      ignored: [],
      people: 0,
      error: "tooLong",
    });
    expect(parse("א".repeat(PEOPLE_IMPORT_CHARS)).error).toBe("invalid");
  });

  it("is empty for empty input", () => {
    expect(parse(" \n\n\t")).toEqual({
      lines: [],
      header: false,
      ignored: [],
      people: 0,
      error: null,
    });
  });
});

const invite = (
  over: Partial<KnownInvite> & { phone: string },
): KnownInvite => ({
  id: `invite-${over.phone}`,
  name: "דנה כהן",
  role: "worker",
  namedRole: null,
  linkPending: true,
  expired: false,
  touchable: true,
  ...over,
});

const team = (
  invites: KnownInvite[] = [],
  members: { phone: string; name: string | null }[] = [],
): KnownTeam => knownTeamOf(members, invites);

const outcomes = (text: string, known: KnownTeam, roles = OWNER) =>
  againstTeam(parse(text, roles), known).lines.map((line) => line.outcome);

describe("againstTeam", () => {
  it("leaves a member out, by the team's own name when it differs", () => {
    const check = againstTeam(
      parse(["דנה כהן 050-123-4567", "יוסי לוי 052-765-4321"].join("\n")),
      team(
        [],
        [
          { phone: "+972501234567", name: "דנה כהן" },
          { phone: "+972527654321", name: "יוסף לוי" },
        ],
      ),
    );
    expect(check.lines.map((line) => [line.outcome, line.memberName])).toEqual([
      ["member", "דנה כהן"],
      ["member", "יוסף לוי"],
    ]);
    expect(check.send).toEqual([]);
    expect(check.blocked).toBe("nothingNew");
  });

  it("never blocks on the owner's own line or an accountant on the team", () => {
    const check = againstTeam(
      parse(
        [
          "משה לוי, 050-123-4567, בעלים",
          "רינה כץ, 052-765-4321, הנהלת חשבונות",
          "דנה כהן, 054-111-2233",
        ].join("\n"),
      ),
      team(
        [],
        [
          { phone: "+972501234567", name: "משה לוי" },
          { phone: "+972527654321", name: "רינה כץ" },
        ],
      ),
    );
    expect(check.lines.map((line) => line.outcome)).toEqual([
      "member",
      "member",
      "new",
    ]);
    expect(check.counts.problems).toBe(0);
    expect(check.blocked).toBeNull();
    expect(check.send).toEqual([
      { ...worker("דנה כהן", "+972541112233"), line: 3 },
    ]);
    // Each line keeps the name it read, so the screen says "בשם …" only
    // for a name the team knows them by and the line doesn't.
    expect(
      check.lines.map((line) => [
        line.kind === "problem" ? line.name : null,
        line.memberName,
      ]),
    ).toEqual([
      ["משה לוי", "משה לוי"],
      ["רינה כץ", "רינה כץ"],
      [null, undefined],
    ]);
  });

  it("updates an invite with no link yet: the same, the name, the role, both", () => {
    const known = team([
      invite({ phone: "+972501234567", name: "דנה כהן" }),
      invite({ phone: "+972527654321", name: "יוסי" }),
      invite({ phone: "+972541112233", name: "מיכל אברהם" }),
      invite({ phone: "+972532223344", name: "נועה" }),
    ]);
    expect(
      outcomes(
        [
          "דנה כהן 050-123-4567",
          "יוסי לוי 052-765-4321",
          "מיכל אברהם 054-111-2233 ניהול",
          "נועה פרץ 053-222-3344 ניהול",
        ].join("\n"),
        known,
      ),
    ).toEqual(["same", "updateName", "updateRole", "update"]);
  });

  it("keeps a waiting manager's role when the line names none", () => {
    const known = team([
      invite({ phone: "+972501234567", name: "דנה", role: "manager" }),
      invite({ phone: "+972527654321", name: "יוסי לוי", role: "manager" }),
    ]);
    const check = againstTeam(
      parse(["דנה כהן 050-123-4567", "יוסי לוי 052-765-4321"].join("\n")),
      known,
    );
    expect(check.lines.map((line) => line.outcome)).toEqual([
      "updateName",
      "same",
    ]);
    expect(check.lines[0]?.invite).toEqual({
      role: "manager",
      namedRole: null,
    });
    expect(check.counts.byRole).toEqual({ manager: 1 });
    expect(check.send).toEqual([
      { ...worker("דנה כהן", "+972501234567"), line: 1 },
    ]);
  });

  it("never changes an owner's or an accountant's invite, whatever the line says", () => {
    const known = team([
      invite({ phone: "+972501234567", role: "owner" }),
      invite({
        phone: "+972527654321",
        role: "accountant",
        linkPending: false,
      }),
    ]);
    expect(
      outcomes(
        ["דנה כהן 050-123-4567", "יוסי לוי 052-765-4321 בעלים"].join("\n"),
        known,
      ),
    ).toEqual(["otherRole", "otherRole"]);
  });

  it("leaves an invite the viewer may not change, and one with a link, open or expired", () => {
    const known = team([
      invite({ phone: "+972501234567", touchable: false }),
      invite({ phone: "+972527654321", linkPending: false }),
      invite({ phone: "+972541112233", linkPending: false, expired: true }),
      invite({
        phone: "+972532223344",
        linkPending: false,
        touchable: false,
      }),
    ]);
    const check = againstTeam(
      parse(
        [
          "דנה כהן 050-123-4567",
          "יוסי לוי 052-765-4321",
          "מיכל אברהם 054-111-2233",
          "נועה פרץ 053-222-3344",
        ].join("\n"),
      ),
      known,
    );
    // Only an invite with no link yet is "locked": it has no link to speak of.
    expect(check.lines.map((line) => line.outcome)).toEqual([
      "locked",
      "invited",
      "expired",
      "invited",
    ]);
    expect(check.lines.map(groupOf)).toEqual([
      "leftOut",
      "leftOut",
      "leftOut",
      "leftOut",
    ]);
    expect([check.counts.locked, check.counts.invited]).toEqual([1, 2]);
    expect(check.send).toEqual([]);
  });

  it("holds a line that would be written to its problem, and lets one on the team go", () => {
    const known = team(
      [invite({ phone: "+972501234567" })],
      [{ phone: "+972527654321", name: "יוסי לוי" }],
    );
    const check = againstTeam(
      parse(
        ["050-123-4567 בעלים", "052-765-4321 בעלים", "053-222-3344 בעלים"].join(
          "\n",
        ),
      ),
      known,
    );
    expect(
      check.lines.map((line) => [line.kind, line.outcome, groupOf(line)]),
    ).toEqual([
      ["problem", undefined, "fix"],
      ["problem", "member", "leftOut"],
      ["problem", undefined, "fix"],
    ]);
    expect(check.counts.problems).toBe(2);
    expect(check.blocked).toBe("invalid");
  });

  it("invites again a number whose invite was cancelled", () => {
    // A cancelled invite is claimed: the team the page loads never has it.
    expect(outcomes("דנה כהן 050-123-4567", team())).toEqual(["new"]);
  });

  it(`stops past ${WAITING_INVITES_MAX} invites waiting`, () => {
    const waiting = Array.from({ length: WAITING_INVITES_MAX - 1 }, (_, i) =>
      invite({
        phone: `+97258${String(i).padStart(7, "0")}`,
        linkPending: i % 2 === 0,
      }),
    );
    expect(team(waiting).waiting).toBe(WAITING_INVITES_MAX - 1);
    const one = againstTeam(parse("דנה כהן 050-123-4567"), team(waiting));
    expect(one.blocked).toBeNull();
    const two = againstTeam(
      parse(["דנה כהן 050-123-4567", "יוסי לוי 052-765-4321"].join("\n")),
      team(waiting),
    );
    expect(two.blocked).toBe("tooManyOpen");
    // An expired invite with a link isn't waiting.
    expect(
      team([
        invite({ phone: "+972501234567", linkPending: false, expired: true }),
      ]).waiting,
    ).toBe(0);
  });

  it("has nothing new on a second paste of the same list", () => {
    const text = ["דנה כהן 050-123-4567", "יוסי לוי 052-765-4321"].join("\n");
    const known = team([
      invite({ phone: "+972501234567", name: "דנה כהן" }),
      invite({ phone: "+972527654321", name: "יוסי לוי" }),
    ]);
    const check = againstTeam(parse(text), known);
    expect(check.lines.map((line) => line.outcome)).toEqual(["same", "same"]);
    expect(check.blocked).toBe("nothingNew");
  });

  it("notes someone on the team with the same name and another number", () => {
    const check = againstTeam(
      parse("דנה כהן 050-123-4567"),
      team([], [{ phone: "+972527654321", name: "דנה כהן" }]),
    );
    expect(check.lines[0]).toMatchObject({
      outcome: "new",
      notes: [{ kind: "sameNameTeam", name: "דנה כהן" }],
    });
  });

  it("sorts a computer's table: to fix, new, updated, left out", () => {
    const check = againstTeam(
      parse(
        [
          "דנה כהן 050-123-4567",
          "יוסי לוי 052-765-4321",
          "מיכל",
          "נועה פרץ 053-222-3344",
        ].join("\n"),
      ),
      team(
        [invite({ phone: "+972527654321", name: "יוסי" })],
        [{ phone: "+972532223344", name: "נועה פרץ" }],
      ),
    );
    expect(tableOrder(check.lines).map((line) => line.line)).toEqual([
      3, 1, 2, 4,
    ]);
  });
});

describe("againstTeam: numbers on another business's staff (the console)", () => {
  const text = [
    "דנה כהן 050-123-4567",
    "יוסי לוי 052-765-4321 ניהול",
    "מיכל אברהם 054-111-2233",
  ].join("\n");

  it("holds a line that would be written with such a number to fix, with its name and role", () => {
    const check = againstTeam(parse(text), team(), new Set(["+972527654321"]));
    expect(check.lines[1]).toEqual({
      line: 2,
      text: "יוסי לוי 052-765-4321 ניהול",
      dropped: [],
      kind: "problem",
      problem: "elsewhere",
      phone: "+972527654321",
      name: "יוסי לוי",
      roleLabel: "ניהול",
    });
    expect(check.lines.map(groupOf)).toEqual(["invite", "fix", "invite"]);
    expect(check.counts.problems).toBe(1);
    expect(check.counts.byRole).toEqual({ worker: 2 });
    expect(check.send.map((person) => person.line)).toEqual([1, 3]);
    expect(check.blocked).toBe("invalid");
    // Removed from the paste, nothing holds the rest.
    const rest = againstTeam(
      parse([text.split("\n")[0], text.split("\n")[2]].join("\n")),
      team(),
      new Set(["+972527654321"]),
    );
    expect(rest.blocked).toBeNull();
    expect(rest.send).toHaveLength(2);
  });

  it("holds an update to an invite with no link yet too, as the database writes it", () => {
    const check = againstTeam(
      parse("דנה כהן 050-123-4567"),
      team([invite({ phone: "+972501234567", name: "דנה" })]),
      new Set(["+972501234567"]),
    );
    expect(check.lines[0]).toMatchObject({
      kind: "problem",
      problem: "elsewhere",
      name: "דנה כהן",
    });
    expect(check.lines[0]?.outcome).toBeUndefined();
    expect(check.counts.updateName).toBe(0);
    expect(check.send).toEqual([]);
  });

  it("never marks a line left out: a member's, the same invite, one with a link", () => {
    const numbers = new Set([
      "+972501234567",
      "+972527654321",
      "+972541112233",
    ]);
    const check = againstTeam(
      parse(text),
      team(
        [
          invite({ phone: "+972527654321", name: "יוסי לוי", role: "manager" }),
          invite({ phone: "+972541112233", linkPending: false }),
        ],
        [{ phone: "+972501234567", name: "דנה כהן" }],
      ),
      numbers,
    );
    expect(check.lines.map((line) => line.outcome)).toEqual([
      "member",
      "same",
      "invited",
    ]);
    expect(check.counts.problems).toBe(0);
    expect(check.blocked).toBe("nothingNew");
  });

  it("keeps a pair's both lines on the line it marks", () => {
    const check = againstTeam(
      parse(["דנה כהן", "050-123-4567", "יוסי לוי", "052-765-4321"].join("\n")),
      team(),
      new Set(["+972501234567"]),
    );
    expect(check.lines[0]).toMatchObject({
      line: 1,
      last: 2,
      problem: "elsewhere",
    });
    expect(check.lines[1]).toMatchObject({ line: 3, last: 4, kind: "person" });
  });

  it("reads as before with no such numbers", () => {
    expect(againstTeam(parse(text), team(), new Set())).toEqual(
      againstTeam(parse(text), team()),
    );
  });
});

describe("writtenRoleOf: the role the database's answer says an invite ends with", () => {
  const manager = invite({
    phone: "+972501234567",
    name: "דנה",
    role: "manager",
  });
  const sentOf = (text: string, known: KnownTeam) => {
    const check = againstTeam(parse(text), known);
    const [person] = check.send;
    if (!person) throw new Error("nothing sent");
    const line = check.lines.find((one) => one.line === person.line);
    return { person, line };
  };

  it("a new invite has the role sent, whatever the preview read", () => {
    const { person, line } = sentOf("דנה כהן 050-123-4567", team([manager]));
    expect(line?.outcome).toBe("updateName");
    // The invite read was cancelled meanwhile: the database made a new one.
    expect(writtenRoleOf("created", person, line)).toEqual({
      role: "worker",
      namedRole: null,
    });
  });

  it("an invite updated from a line that named no role keeps the one the screen read", () => {
    const { person, line } = sentOf("דנה כהן 050-123-4567", team([manager]));
    expect(writtenRoleOf("updated", person, line)).toEqual({
      role: "manager",
      namedRole: null,
    });
  });

  it("an invite updated from a line that named its role has that role", () => {
    const { person, line } = sentOf(
      "דנה כהן 050-123-4567 צוות",
      team([manager]),
    );
    expect(line?.outcome).toBe("update");
    expect(writtenRoleOf("updated", person, line)).toEqual({
      role: "worker",
      namedRole: null,
    });
  });

  it("names no role for an invite made meanwhile, which the preview read as new", () => {
    // Read as new, but another tab invited the number as a manager since:
    // the database kept that invite's role, which the screen never saw.
    const { person, line } = sentOf("דנה כהן 050-123-4567", team());
    expect(line?.outcome).toBe("new");
    expect(writtenRoleOf("updated", person, line)).toBeNull();
    expect(writtenRoleOf("created", person, line)).toEqual({
      role: "worker",
      namedRole: null,
    });
  });
});

describe("importsPeople: whether the Team screen's import opens for a viewer", () => {
  const choices = (viewer: Viewer, pay: Role[] = [], named = NAMED) =>
    inviteChoices(viewer, named, ownerOnlyRoles(viewer, pay));
  const manager: Viewer = {
    role: "manager",
    perms: ["team.view", "team.edit"],
  };
  const editor: Viewer = { role: "worker", perms: ["team.view", "team.edit"] };

  it("opens for an owner, a manager and a worker who edits the team", () => {
    expect(importsPeople(choices({ role: "owner", perms: [] }))).toBe(true);
    expect(importsPeople(choices(manager))).toBe(true);
    expect(importsPeople(choices(editor))).toBe(true);
  });

  it("opens for a manager while one staff role is left them", () => {
    expect(importsPeople(choices(manager, ["manager"]))).toBe(true);
    expect(importsPeople(choices(manager, ["worker"]))).toBe(true);
  });

  it("stays shut when every staff role is an owner's alone, named ones too", () => {
    expect(importsPeople(choices(manager, ["manager", "worker"], []))).toBe(
      false,
    );
    // Workers see pay: the host, a named role on them that holds nothing,
    // is still the editor's to give (a named role never holds pay); the
    // shift lead holds the schedule, which the editor doesn't.
    expect(importsPeople(choices(editor, ["worker"]))).toBe(true);
    expect(importsPeople(choices(editor, ["worker"], [SHIFT_LEAD]))).toBe(
      false,
    );
  });

  it("stays shut for someone who doesn't edit the team", () => {
    expect(
      importsPeople(choices({ role: "manager", perms: ["team.view"] })),
    ).toBe(false);
    expect(importsPeople(choices({ role: "worker", perms: [] }))).toBe(false);
  });

  it("is never opened by an owner's or an accountant's choice alone", () => {
    expect(
      importsPeople([
        { role: "owner", namedRole: null, blocked: null },
        { role: "accountant", namedRole: null, blocked: null },
      ]),
    ).toBe(false);
  });
});

describe("teamKnownOf: the Team screen's team, as a paste is checked against it", () => {
  const today = new Date("2026-11-26T09:00:00Z");
  const owner: Viewer = { role: "owner", perms: [] };
  const manager: Viewer = {
    role: "manager",
    perms: ["team.view", "team.edit"],
  };
  const read = buildTeam(
    [
      {
        userId: "u1",
        name: "משה לוי",
        phone: "+972501110001",
        role: "owner",
        photo: null,
        addressForm: null,
      },
      // A number the database didn't give this viewer is no member to match.
      {
        userId: "u2",
        name: "רונית",
        phone: null,
        role: "worker",
        photo: null,
        addressForm: null,
      },
    ],
    [
      {
        id: "pending-worker",
        name: "דנה כהן",
        phone: "+972501110002",
        role: "worker",
        expiresAt: "2026-11-01T00:00:00Z",
        linkPending: true,
      },
      {
        id: "open-manager",
        name: "יוסי",
        phone: "+972501110003",
        role: "manager",
        expiresAt: "2026-12-01T00:00:00Z",
      },
      {
        id: "expired-worker",
        name: null,
        phone: "+972501110004",
        role: "worker",
        expiresAt: "2026-11-20T00:00:00Z",
      },
      {
        id: "pending-lead",
        name: "אור",
        phone: "+972501110005",
        role: "worker",
        namedRole: {
          id: SHIFT_LEAD_ID,
          name: "אחראי משמרת",
          nameEn: null,
          base: "worker",
        },
        expiresAt: "2026-11-01T00:00:00Z",
        linkPending: true,
      },
      {
        id: "pending-gone",
        name: "גל",
        phone: "+972501110006",
        role: "worker",
        namedRole: {
          id: HOST_ID,
          name: "מארחת",
          nameEn: null,
          base: "worker",
          archived: true,
        },
        expiresAt: "2026-11-01T00:00:00Z",
        linkPending: true,
      },
      {
        id: "pending-accountant",
        name: "עמוס",
        phone: "+972501110007",
        role: "accountant",
        expiresAt: "2026-11-01T00:00:00Z",
        linkPending: true,
      },
    ],
    today,
  );
  const byId = (known: KnownTeam) =>
    Object.fromEntries(known.invites.map((i) => [i.id, i]));

  it("keeps the members with a number, and each invite's state as the screen reads it", () => {
    const known = teamKnownOf(read, owner, [SHIFT_LEAD], []);
    expect(known.members).toEqual([
      { phone: "+972501110001", name: "משה לוי" },
    ]);
    const invites = byId(known);
    expect(invites["pending-worker"]).toMatchObject({
      phone: "+972501110002",
      name: "דנה כהן",
      role: "worker",
      namedRole: null,
      linkPending: true,
      // Past its date, but no link of it ever ran out.
      expired: false,
    });
    expect(invites["open-manager"]).toMatchObject({
      linkPending: false,
      expired: false,
    });
    expect(invites["expired-worker"]).toMatchObject({
      name: null,
      linkPending: false,
      expired: true,
    });
    expect(invites["pending-lead"]?.namedRole).toBe(SHIFT_LEAD_ID);
    // Waiting: the four with no link, and the open one; not the expired one.
    expect(known.waiting).toBe(5);
  });

  it("lets an owner update every staff invite but one to a role removed since, and never an accountant's", () => {
    const invites = byId(teamKnownOf(read, owner, [SHIFT_LEAD], []));
    expect(invites["pending-worker"]?.touchable).toBe(true);
    expect(invites["open-manager"]?.touchable).toBe(true);
    expect(invites["pending-lead"]?.touchable).toBe(true);
    expect(invites["pending-gone"]?.touchable).toBe(false);
    expect(invites["pending-accountant"]?.touchable).toBe(false);
  });

  it("holds a manager to the roles they give: none that sees pay, none that holds what they don't", () => {
    const free = byId(teamKnownOf(read, manager, [SHIFT_LEAD], []));
    expect(free["pending-worker"]?.touchable).toBe(true);
    expect(free["open-manager"]?.touchable).toBe(true);
    // The shift lead holds the schedule, which this manager doesn't.
    expect(free["pending-lead"]?.touchable).toBe(false);
    const paid = byId(teamKnownOf(read, manager, [SHIFT_LEAD], ["worker"]));
    expect(paid["pending-worker"]?.touchable).toBe(false);
    expect(paid["expired-worker"]?.touchable).toBe(false);
    expect(paid["open-manager"]?.touchable).toBe(true);
  });

  it("reads a paste as the import does: an invite the viewer may not change is left as it is", () => {
    const viewer = manager;
    const check = againstTeam(
      parse(
        [
          "דנה כהן 050-111-0002 ניהול",
          "אור 050-111-0005 ניהול",
          "משה לוי 050-111-0001",
          "חדשה מהרשימה 050-111-0008 ניהול",
        ].join("\n"),
        rolesFor(viewer, { pay: ["worker"], named: [SHIFT_LEAD] }),
      ),
      teamKnownOf(read, viewer, [SHIFT_LEAD], ["worker"]),
    );
    expect(check.lines.map((line) => line.outcome)).toEqual([
      "locked",
      "locked",
      "member",
      "new",
    ]);
    expect(check.send.map((person) => person.phone)).toEqual(["+972501110008"]);
  });
});

describe("peopleImportRows", () => {
  const row = {
    name: "דנה כהן",
    phone: "+972501234567",
    role: "worker",
    namedRole: null,
    roleFromLine: false,
  };

  it("takes rows as the screen reads them", () => {
    expect(peopleImportRows.safeParse([row]).success).toBe(true);
    expect(
      peopleImportRows.safeParse([
        { ...row, phone: "+972527654321", namedRole: SHIFT_LEAD_ID },
      ]).success,
    ).toBe(true);
  });

  it("refuses a name not read as the team keeps names, a landline, an owner, a number twice and 301 rows", () => {
    for (const bad of [
      [{ ...row, name: " דנה  כהן" }],
      [{ ...row, name: `דנה${ZERO_WIDTH} כהן` }],
      [{ ...row, phone: "+97231234567" }],
      [{ ...row, phone: "0501234567" }],
      [{ ...row, role: "owner" }],
      [{ ...row, namedRole: "shift-lead" }],
      // Nothing more than the screen read leaves the device.
      [{ ...row, text: "דנה כהן 050-123-4567 123456782" }],
      [{ ...row, dropped: ["123456782"] }],
      [{ ...row, line: 1 }],
      [row, { ...row, name: "יוסי לוי" }],
      [],
      Array.from({ length: PEOPLE_IMPORT_MAX + 1 }, (_, i) => ({
        ...row,
        phone: `+97250${String(i).padStart(7, "0")}`,
      })),
    ]) {
      expect(peopleImportRows.safeParse(bad).success).toBe(false);
    }
  });
});

describe("parsePeopleList: what a paste may hold", () => {
  it("reads a header in other words, but never a title in one cell", () => {
    const parsed = parse(
      [
        "שם החנות: סופר השכונה",
        "שם העובד המלא\tמספר פלאפון",
        "דנה כהן\t050-123-4567",
        "יוסי לוי\t052-765-4321",
      ].join("\n"),
    );
    expect(parsed.lines.map((line) => line.kind)).toEqual([
      "title",
      "header",
      "person",
      "person",
    ]);
  });

  it("reads Arabic-Indic digits in a sheet's column", () => {
    const parsed = parse(["دانة\t٠٥٠١٢٣٤٥٦٧", "يوسف\t٠٥٢٧٦٥٤٣٢١"].join("\n"));
    expect(persons(parsed).map((person) => person.phone)).toEqual([
      "+972501234567",
      "+972527654321",
    ]);
  });

  it("reads a long line of spaces, pipes or digits in time", () => {
    const started = performance.now();
    for (const text of [
      "1 ".repeat(90_000),
      `${" ".repeat(190_000)}|`,
      `(${" ".repeat(190_000)}`,
      `${"א".repeat(100_000)}.`,
    ]) {
      // Nothing there is a person, and nothing there takes long to say so.
      expect(parse(text).lines.some((line) => line.kind === "person")).toBe(
        false,
      );
    }
    expect(performance.now() - started).toBeLessThan(3000);
  });

  it("passes the paste's own block on before any of the team's", () => {
    const known = team();
    expect(
      againstTeam(parse("א".repeat(PEOPLE_IMPORT_CHARS + 1)), known).blocked,
    ).toBe("tooLong");
    expect(againstTeam(parse(list(PEOPLE_IMPORT_MAX + 1)), known).blocked).toBe(
      "tooMany",
    );
    expect(
      againstTeam(
        parse(
          [
            "דנה\t050-123-4567\t052-765-4321",
            "יוסי\t054-111-2233\t053-222-3344",
          ].join("\n"),
        ),
        known,
      ).blocked,
    ).toBe("phoneColumns");
    expect(againstTeam(parse(""), known).blocked).toBeNull();
  });
});
