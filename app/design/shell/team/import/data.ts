import type { KnownInvite } from "@domain/people-import";

/**
 * The pastes of the people import's twin (/design/shell/team/import), as
 * a clinic, a shop and a cleaning crew would paste them: made-up names and
 * numbers (054-710-xxxx), and ID numbers nobody holds. None of the numbers
 * is the twin team's, but the owner's own line in `problems`, which is
 * left out as already on the team.
 */

const RLM = String.fromCodePoint(0x200f);
const LRM = String.fromCodePoint(0x200e);

/** A clinic's list from WhatsApp: marks, a contact nobody saved, bullets, roles at either end. */
const whatsapp = [
  `${RLM}~ ד״ר מיכל רוזן${LRM}: ${LRM}+972 54-710-2201${LRM}`,
  "• יעל ברק 054-710-2202",
  "3. אחמד חטיב 054-710-2203 ניהול",
  "עדי שמש: 00972 54 710 2204",
  "אחראי משמרת: רותם גל 054-710-2205",
  "Анна Ковалёва 054-710-2206",
  "נועם פרידמן 0547102207, ת.ז 000000018",
].join("\n");

/** A shop's sheet, copied from Excel: its title, the header, an ID column, a wage, a dropped zero. */
const sheet = [
  "עובדי החנות, נובמבר 2026",
  "",
  ["שם פרטי", "שם משפחה", "ת.ז.", "נייד", "תפקיד", "שכר לשעה"].join("\t"),
  ["אורית", "לוי", "000000026", "547103301", "ניהול", "48"].join("\t"),
  ["שגיא", "אוחנה", "000000034", "054-710-3302", "", "36"].join("\t"),
  ["ליאת", "מזרחי", "000000042", "054-710-3303", "צוות", "36"].join("\t"),
  ["בוריס", "קפלן", "000000059", "054-710-3304", "", "38"].join("\t"),
  ["הדס", "נחום", "000000067", "054-710-3305", "", "36"].join("\t"),
  ["עמית", "שגב", "000000075", "054-710-3306", "", "40"].join("\t"),
].join("\n");

/**
 * A cleaning crew's list with what needs fixing: two headings with no
 * number, the owner's own line, two numbers on a line, a landline, Excel's
 * shortened number, the same number with another role, a line a PDF
 * turned around and an accountant, who is invited one at a time.
 */
const problems = [
  "צוות הניקיון - משמרת בוקר:",
  "אורי בן דוד, 052-123-4567, בעלים",
  "סיגל אדרי 054-710-4401",
  "מרים כהן 054-710-4402 / 052-710-4402",
  "יוסף אלמו 03-6100000",
  "טל פרץ 5.47E+08",
  "סיגל אדרי 054-710-4401 ניהול",
  "ןורטש הנור 054-710-4405",
  "רינה גבאי 054-710-4406 מנהלת חשבונות",
  "משמרת ערב:",
  "דוד סלאמה 054-710-4407",
].join("\n");

const FIRST = ["אביב", "בר", "גל", "דור", "הילה", "ורד", "זיו", "חן"];
const LAST = ["אלון", "ברק", "גולן", "דהן", "הררי", "ויס", "זך", "חזן"];

/** More than an import takes: 320 people. */
const tooMany = Array.from({ length: 320 }, (_, i) => {
  const first = FIRST[i % FIRST.length];
  const last = LAST[Math.floor(i / FIRST.length) % LAST.length];
  return `${first} ${last} 054-71${String(100_000 + i).slice(1)}`;
}).join("\n");

export const importPastes = { whatsapp, sheet, problems, tooMany };

/**
 * The shop's sheet a second time (`?state=again`): its people's invites as
 * the first paste left them, some since sent or joined. Orit's is the
 * same; Sagi's waits under his first name only; Liat's as a manager, which
 * her line changes; Boris got his link, Hadas's ran out, Amit joined.
 */
export const againInvites: KnownInvite[] = [
  {
    id: "orit",
    phone: "+972547103301",
    name: "אורית לוי",
    role: "manager",
    namedRole: null,
    linkPending: true,
    expired: false,
    touchable: true,
  },
  {
    id: "sagi",
    phone: "+972547103302",
    name: "שגיא",
    role: "worker",
    namedRole: null,
    linkPending: true,
    expired: false,
    touchable: true,
  },
  {
    id: "liat",
    phone: "+972547103303",
    name: "ליאת מזרחי",
    role: "manager",
    namedRole: null,
    linkPending: true,
    expired: false,
    touchable: true,
  },
  {
    id: "boris",
    phone: "+972547103304",
    name: "בוריס קפלן",
    role: "worker",
    namedRole: null,
    linkPending: false,
    expired: false,
    touchable: true,
  },
  {
    id: "hadas",
    phone: "+972547103305",
    name: "הדס נחום",
    role: "worker",
    namedRole: null,
    linkPending: false,
    expired: true,
    touchable: true,
  },
];

/** Who of the sheet joined since the first paste. */
export const againMembers = [{ phone: "+972547103306", name: "עמית שגב" }];
