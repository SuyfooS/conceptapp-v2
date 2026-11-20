// Mock rows for the order-taking demo (S0 of waiter mode, issue #191): the
// demo restaurant's sample menu, its tables and an evening's orders, as
// Shiran, the shift manager, finds them at 20:42 on a Thursday. They stand
// in for database rows (dishes, choices, departments, people, a pasted
// menu), so their Hebrew stays here rather than in messages/; the
// Hebrew-literal check in tooling/ allows this file.

import type { DraftLine } from "@domain/order-screens";
import { portraits } from "../portraits";
import { business, user } from "../shell/data";
import type {
  Category,
  Department,
  DepartmentKey,
  Menu,
  MenuItem,
  Order,
  Person,
  Place,
  SentLine,
  Ticket,
} from "./model";

export const orderDemoBusiness = business.name;
export const orderDemoUser = user;

/** Thursday 19 November 2026, 20:42 in Tel Aviv: the demo's clock starts here. */
export const DEMO_START = Date.UTC(2026, 10, 19, 18, 42);
/** That evening at a time in Tel Aviv (two hours ahead of UTC in November). */
const at = (hours: number, minutes: number) =>
  Date.UTC(2026, 10, 19, hours - 2, minutes);

export const READER = "shiran";
/** Shiran is a manager in the bar: she takes nothing back from the bar's tickets. */
export const READER_DEPARTMENTS: readonly DepartmentKey[] = ["bar"];

/** First names only, as people call each other on the floor. */
export const orderDemoPeople: Person[] = [
  { id: "shiran", name: "שירן", photo: portraits.shiran },
  { id: "yoav", name: "יואב", photo: portraits.yoav },
  { id: "maya", name: "מאיה", photo: portraits.maya },
  { id: "noa", name: "נועה", photo: null },
];

export const orderDemoDepartments: Department[] = [
  { key: "kitchen", name: "מטבח" },
  { key: "bar", name: "בר" },
];

/** A department removed since its category went to it: the menu twin's `?state=noRoute`. */
export const demoRemovedDepartment = {
  id: "pastry",
  name: "קונדיטוריה",
  live: false,
};

const categories: Category[] = [
  { id: "starters", name: "ראשונות", department: "kitchen" },
  { id: "mains", name: "עיקריות", department: "kitchen" },
  { id: "desserts", name: "קינוחים", department: "kitchen" },
  { id: "drinks", name: "שתייה", department: "bar" },
];

const items: MenuItem[] = [
  {
    id: "focaccia",
    categoryId: "starters",
    name: "פוקאצ'ה",
    price: 2800,
    groups: [],
  },
  {
    id: "salad",
    categoryId: "starters",
    name: "סלט ירוק",
    price: 3600,
    groups: [],
  },
  {
    id: "hummus",
    categoryId: "starters",
    name: "חומוס",
    price: 3200,
    groups: [],
  },
  {
    id: "schnitzel",
    categoryId: "mains",
    name: "שניצל",
    price: 6200,
    groups: [
      {
        id: "side",
        name: "תוספת",
        min: 1,
        max: 1,
        options: [
          { id: "fries", name: "צ'יפס", price: 0 },
          { id: "mash", name: "פירה", price: 0 },
          { id: "side-salad", name: "סלט", price: 0 },
        ],
      },
    ],
  },
  {
    id: "burger",
    categoryId: "mains",
    name: "המבורגר",
    price: 6800,
    groups: [
      {
        id: "doneness",
        name: "מידת עשייה",
        min: 1,
        max: 1,
        options: [
          { id: "mr", name: "מדיום רייר", price: 0 },
          { id: "m", name: "מדיום", price: 0 },
          { id: "mw", name: "מדיום וול", price: 0 },
          { id: "wd", name: "וול דאן", price: 0 },
        ],
      },
      {
        id: "extras",
        name: "תוספות",
        min: 0,
        max: 2,
        options: [
          { id: "egg", name: "ביצה", price: 600 },
          { id: "cheese", name: "גבינה", price: 600 },
        ],
      },
    ],
  },
  { id: "pasta", categoryId: "mains", name: "פסטה", price: 5600, groups: [] },
  { id: "fish", categoryId: "mains", name: "דג היום", price: 8400, groups: [] },
  {
    id: "malabi",
    categoryId: "desserts",
    name: "מלבי",
    price: 2600,
    groups: [],
  },
  {
    id: "cake",
    categoryId: "desserts",
    name: "עוגת שוקולד",
    price: 3400,
    groups: [],
  },
  {
    id: "lemonade",
    categoryId: "drinks",
    name: "לימונדה",
    price: 1600,
    groups: [],
  },
  { id: "water", categoryId: "drinks", name: "מים", price: 1000, groups: [] },
  {
    id: "coffee",
    categoryId: "drinks",
    name: "קפה",
    price: 1200,
    groups: [
      {
        id: "size",
        name: "גודל",
        min: 1,
        max: 1,
        options: [
          { id: "regular", name: "רגיל", price: 0 },
          { id: "large", name: "גדול", price: 400 },
        ],
      },
    ],
  },
  {
    id: "beer",
    categoryId: "drinks",
    name: "בירה מהחבית",
    price: 2800,
    groups: [
      {
        id: "beer-size",
        name: "גודל",
        min: 1,
        max: 1,
        options: [
          { id: "third", name: "שליש", price: 0 },
          { id: "half", name: "חצי", price: 800 },
        ],
      },
    ],
  },
];

export const orderDemoMenu: Menu = { categories, items };

/** The fish is gone tonight: every phone greys it. */
export const demoSoldOut = ["fish"];

/** The 8 items ordered most in the last 14 days, as the phone's first screen shows them. */
export const mostOrdered = [
  "schnitzel",
  "burger",
  "lemonade",
  "beer",
  "focaccia",
  "hummus",
  "coffee",
  "salad",
];

export const orderDemoTables: Place[] = Array.from({ length: 12 }, (_, i) => ({
  id: `table-${i + 1}`,
  kind: "table",
  name: String(i + 1),
}));

export const demoTakeaways: Place[] = [
  { id: "takeaway-1", kind: "takeaway", name: "1", label: "חולצה אדומה" },
];

/** A sent line, as the send copies it from the menu. */
function line(
  id: string,
  itemId: string,
  qty: number,
  more: Partial<Pick<SentLine, "choices" | "note" | "allergy" | "unit">> = {},
): SentLine {
  const item = items.find((i) => i.id === itemId);
  const choices = more.choices ?? [];
  const extra =
    item?.groups
      .flatMap((g) => g.options)
      .filter((o) => choices.includes(o.name))
      .reduce((sum, o) => sum + o.price, 0) ?? 0;
  return {
    id,
    itemId,
    name: item?.name ?? itemId,
    choices,
    unit: more.unit ?? (item?.price ?? 0) + extra,
    qty,
    note: more.note ?? null,
    allergy: more.allergy ?? null,
    takenBack: false,
  };
}

function ticket(
  id: string,
  department: Ticket["department"],
  state: Ticket["state"],
  lines: SentLine[],
  more: Partial<Ticket> = {},
): Ticket {
  return {
    id,
    department,
    held: false,
    state,
    lines,
    seen: true,
    firedAt: null,
    readyAt: state === "new" ? null : at(20, 40),
    readyBy: null,
    ...more,
  };
}

/**
 * The evening at 20:42: table 4 Shiran's, its starters on the kitchen's
 * screen and its mains held for later; table 7 Yoav's, its drinks ready;
 * table 9 Yoav's, waiting 20 minutes; table 11 Shiran's, dessert ready;
 * table 2 Maya's, all served; takeaway 1 in the kitchen.
 */
export function demoOrders(): Order[] {
  return [
    {
      id: "order-2",
      placeId: "table-2",
      openedBy: "maya",
      openedAt: at(20, 12),
      closedAt: null,
      closedBy: null,
      rounds: [
        {
          id: "round-2a",
          at: at(20, 14),
          by: "maya",
          tickets: [
            ticket("t-2a-bar", "bar", "served", [line("l1", "lemonade", 2)]),
          ],
        },
        {
          id: "round-2b",
          at: at(20, 20),
          by: "maya",
          tickets: [
            ticket("t-2b-kitchen", "kitchen", "served", [
              line("l2", "hummus", 1),
              line("l3", "salad", 1),
            ]),
          ],
        },
      ],
    },
    {
      id: "order-4",
      placeId: "table-4",
      openedBy: "shiran",
      openedAt: at(20, 31),
      closedAt: null,
      closedBy: null,
      rounds: [
        {
          id: "round-4a",
          at: at(20, 36),
          by: "shiran",
          tickets: [
            ticket("t-4a-kitchen", "kitchen", "new", [
              line("l4", "focaccia", 1),
              line("l5", "hummus", 1, { note: "בלי שום" }),
            ]),
            ticket(
              "t-4a-held",
              "kitchen",
              "new",
              [
                line("l6", "schnitzel", 1, { choices: ["פירה"] }),
                line("l7", "burger", 1, {
                  choices: ["מדיום", "גבינה"],
                  allergy: "שומשום",
                }),
              ],
              { held: true },
            ),
            ticket("t-4a-bar", "bar", "served", [
              line("l8", "beer", 2, { choices: ["חצי"] }),
            ]),
          ],
        },
      ],
    },
    {
      id: "order-7",
      placeId: "table-7",
      openedBy: "yoav",
      openedAt: at(20, 25),
      closedAt: null,
      closedBy: null,
      rounds: [
        {
          id: "round-7a",
          at: at(20, 28),
          by: "yoav",
          tickets: [
            ticket(
              "t-7a-bar",
              "bar",
              "ready",
              [
                line("l9", "lemonade", 1),
                line("l10", "coffee", 1, { choices: ["גדול"] }),
              ],
              { readyBy: "yoav" },
            ),
            ticket("t-7a-kitchen", "kitchen", "new", [
              line("l11", "burger", 1, { choices: ["מדיום וול"] }),
            ]),
          ],
        },
      ],
    },
    {
      id: "order-9",
      placeId: "table-9",
      openedBy: "yoav",
      openedAt: at(20, 18),
      closedAt: null,
      closedBy: null,
      rounds: [
        {
          id: "round-9a",
          at: at(20, 22),
          by: "yoav",
          tickets: [
            ticket("t-9a-kitchen", "kitchen", "new", [
              line("l12", "pasta", 1),
              line("l13", "schnitzel", 1, {
                choices: ["צ'יפס"],
                note: "רוטב בצד",
              }),
            ]),
          ],
        },
      ],
    },
    {
      id: "order-11",
      placeId: "table-11",
      openedBy: "shiran",
      openedAt: at(20, 2),
      closedAt: null,
      closedBy: null,
      rounds: [
        {
          id: "round-11a",
          at: at(20, 5),
          by: "shiran",
          tickets: [
            ticket("t-11a-kitchen", "kitchen", "served", [
              line("l14", "schnitzel", 2, { choices: ["צ'יפס"] }),
            ]),
            ticket("t-11a-bar", "bar", "served", [line("l15", "water", 1)]),
          ],
        },
        {
          id: "round-11b",
          at: at(20, 30),
          by: "shiran",
          tickets: [
            ticket(
              "t-11b-kitchen",
              "kitchen",
              "ready",
              [line("l16", "malabi", 1), line("l17", "cake", 1)],
              { readyBy: "noa" },
            ),
          ],
        },
      ],
    },
    {
      id: "order-takeaway-1",
      placeId: "takeaway-1",
      openedBy: "shiran",
      openedAt: at(20, 38),
      closedAt: null,
      closedBy: null,
      rounds: [
        {
          id: "round-t1a",
          at: at(20, 38),
          by: "shiran",
          tickets: [
            ticket("t-t1a-kitchen", "kitchen", "new", [
              line("l18", "burger", 1, { choices: ["וול דאן"] }),
            ]),
          ],
        },
      ],
    },
  ];
}

/** Today's closed orders, each with its list for the till. */
export function demoClosed(): Order[] {
  return [
    {
      id: "order-3",
      placeId: "table-3",
      openedBy: "yoav",
      openedAt: at(19, 5),
      closedAt: at(20, 10),
      closedBy: "yoav",
      rounds: [
        {
          id: "round-3a",
          at: at(19, 8),
          by: "yoav",
          tickets: [
            ticket("t-3a-bar", "bar", "served", [
              line("l19", "beer", 2, { choices: ["שליש"] }),
            ]),
            ticket("t-3a-kitchen", "kitchen", "served", [
              line("l20", "focaccia", 1),
              line("l21", "burger", 2, { choices: ["מדיום"] }),
            ]),
          ],
        },
      ],
    },
    {
      id: "order-5",
      placeId: "table-5",
      openedBy: "shiran",
      openedAt: at(18, 40),
      closedAt: at(19, 55),
      closedBy: "shiran",
      rounds: [
        {
          id: "round-5a",
          at: at(18, 44),
          by: "shiran",
          tickets: [
            ticket("t-5a-kitchen", "kitchen", "served", [
              line("l22", "pasta", 2),
              line("l23", "salad", 1),
            ]),
          ],
        },
      ],
    },
  ];
}

/**
 * The draft of `?state=draft`: an allergy, two lemonades, and a main held
 * for later with its side, which the draft names (P4: one note a line, the
 * allergy said in it).
 */
export function demoDraft(): DraftLine[] {
  return [
    {
      id: "d1",
      item: "salad",
      quantity: 1,
      note: "אגוזים",
      allergy: true,
      held: false,
      choices: [],
    },
    {
      id: "d2",
      item: "lemonade",
      quantity: 2,
      note: null,
      allergy: false,
      held: false,
      choices: [],
    },
    {
      id: "d3",
      item: "schnitzel",
      quantity: 1,
      note: "בלי מלח",
      allergy: false,
      held: true,
      choices: [{ group: "side", option: "mash" }],
    },
  ];
}

/** A draft with the fish, sold out since it was chosen (`?state=soldOut`). */
export function demoFishDraft(): DraftLine[] {
  return [
    {
      id: "d4",
      item: "fish",
      quantity: 1,
      note: null,
      allergy: false,
      held: false,
      choices: [],
    },
    {
      id: "d5",
      item: "water",
      quantity: 2,
      note: null,
      allergy: false,
      held: false,
      choices: [],
    },
  ];
}

/** What a waiter just sent, for `?state=sent`: its lines can still be taken back. */
export function demoJustSent(): Order {
  return {
    id: "order-6",
    placeId: "table-6",
    openedBy: "shiran",
    openedAt: DEMO_START,
    closedAt: null,
    closedBy: null,
    rounds: [
      {
        id: "round-6a",
        at: DEMO_START,
        by: "shiran",
        tickets: [
          ticket(
            "t-6a-kitchen",
            "kitchen",
            "new",
            [line("l24", "focaccia", 1)],
            {
              seen: false,
            },
          ),
          ticket("t-6a-bar", "bar", "new", [line("l25", "lemonade", 2)], {
            seen: false,
          }),
        ],
      },
    ],
  };
}

/**
 * A café's menu as it would be pasted from a website or a WhatsApp message
 * (waiter mode P2's import twin): categories, prices with and without ₪,
 * two sizes and extras, clean enough to add as it is.
 */
export const demoPastedMenu = [
  "ארוחות בוקר",
  "ארוחת בוקר ישראלית 68",
  "שקשוקה ₪54",
  "+ גבינה בולגרית 6",
  "טוסט גבינות 42.50",
  "שתייה חמה",
  "קפה הפוך 14/17",
  "+ חלב שקדים 3",
  "תה נענע 12",
].join("\n");

/** The same with a line a PDF turned around (`?state=reversed`). */
export const demoReversedPaste = [demoPastedMenu, "םח וקוש 15"].join("\n");

/**
 * The same with lines to fix (`?state=problems`): a line turned around and
 * a line with no price, which hold the import. Around them, lines the
 * preview shows as read: the toast again, an item of the hot drinks this
 * time, and a cake whose price has a letter for a digit, a category then.
 */
export const demoProblemPaste = [
  demoPastedMenu,
  "טוסט גבינות 42.50",
  "םח וקוש 15",
  "עוגת גבינה 3O",
  "מאפה היום, שואלים את המלצר על הטעמים של היום ועל המחיר שלהם",
].join("\n");

/**
 * A paste onto the menu already there (`?state=known`): the mains, which the
 * menu has, take a new dish, and the schnitzel already there is left out.
 */
export const demoKnownPaste = [
  "עיקריות",
  "שניצל 62",
  "+ צ'יפס 12",
  "פרגית על האש 72",
  "קינוחים",
  "סורבה לימון 28",
].join("\n");

/**
 * The restaurant's and the café's own sentences for taking orders, as
 * supabase/migrations/20261120000100_order_taking_screens.sql writes them
 * and 20261121000100_order_taking_mode.sql after it
 * (tooling/template-wording.test.ts holds the two the same): the twin's
 * restaurant reads its screens in them, as the demo restaurant does.
 */
export const restaurantWording: Readonly<Record<string, string>> = {
  "modules.order_taking.name": "מצב מלצרות",
  "modules.order_taking.description": "קבלת הזמנות ושליחה למטבח ולבר",
  "app.orders.menu.status.items":
    "{count, plural, one {מנה אחת} other {# מנות}}",
  "app.orders.menu.status.soldOut":
    "{count, plural, one {אחת נגמרה} other {# נגמרו}}",
  "app.orders.menu.status.noRoute":
    "{count, plural, one {מנה אחת בלי מחלקה} other {# מנות בלי מחלקה}}",
  "app.orders.menu.add": "הוספת מנה",
  "app.orders.menu.readOnly.department":
    'את התפריט משנה מי שמנהל אותו. מסמנים "נגמר" למנות שמכינים במחלקה שלך.',
  "app.orders.menu.empty.body":
    "מוסיפים מנות אחת אחת, או מעתיקים תפריט קיים מהאתר, מקובץ PDF או מהקופה.",
  "app.orders.menu.emptyCategory": "עוד אין כאן מנות.",
  "app.orders.menu.categoryLine":
    "{department} · {count, plural, =0 {אין מנות} one {מנה אחת} other {# מנות}}",
  "app.orders.menu.placesRow": "השולחנות",
  "app.orders.menu.placesCount":
    "{count, plural, =0 {עוד אין שולחנות} one {שולחן אחד} other {# שולחנות}}",
  "app.orders.menu.columns.name": "מנה",
  "app.orders.menu.sheet.newTitle": "מנה חדשה",
  "app.orders.menu.sheet.name": "שם המנה",
  "app.orders.menu.sheet.nameMissing": "כותבים את שם המנה, עד 60 תווים.",
  "app.orders.menu.toast.soldOut": "סומנה שנגמרה: {name}",
  "app.orders.menu.toast.available": "חזרה לתפריט: {name}",
  "app.orders.menu.toast.added": "נוספה לתפריט: {name}",
  "app.orders.menu.toast.saved": "נשמרה: {name}",
  "app.orders.menu.toast.removed": "הוסרה מהתפריט: {name}",
  "app.orders.menu.failed.off": "מצב מלצרות כבוי בעסק הזה.",
  "app.orders.menu.failed.gone": "המנה כבר לא בתפריט.",
  "app.orders.menu.failed.choices": "הבחירות של המנה לא נשמרו כמו שהן.",
  "app.orders.menu.failed.changed":
    "מישהו שינה את המנה בינתיים. זה מה שיש בה עכשיו.",
  "app.orders.menu.failed.tooMany":
    "בתפריט כבר יש כמה שאפשר: עד 300 מנות ו-30 קטגוריות.",
  "app.orders.menu.failed.archived": "המנה הוסרה מהתפריט. מחזירים אותה קודם.",
  "app.orders.menu.failed.categoryRemoved":
    "הקטגוריה של המנה הוסרה. מחזירים אותה קודם.",
  "app.orders.categories.count":
    "{count, plural, =0 {אין מנות} one {מנה אחת} other {# מנות}}",
  "app.orders.categories.removed":
    "{count, plural, =0 {הקטגוריה {name} הוסרה} one {הקטגוריה {name} הוסרה, עם מנה אחת} other {הקטגוריה {name} הוסרה, עם # מנות}}",
  "app.orders.categories.itemsEmpty":
    "עוד אין כאן מנות. מוסיפים אותן במסך התפריט.",
  "app.orders.places.title": "השולחנות",
  "app.orders.places.subtitle":
    'השולחנות שמקבלים אליהם הזמנות. אפשר לקרוא להם בשם, כמו "בר 3" או "מרפסת 2". הסדר כאן הוא הסדר במסך.',
  "app.orders.places.quick.title": "כמה שולחנות יש",
  "app.orders.places.quick.action":
    "{count, plural, one {יצירת שולחן אחד} other {יצירת # שולחנות}}",
  "app.orders.places.nameOf": "שם השולחן {name}",
  "app.orders.places.newName": "שולחן חדש",
  "app.orders.places.add": "הוספת שולחן",
  "app.orders.places.removed": "השולחן {name} הוסר",
  "app.orders.places.taken": "כבר יש שולחן בשם {name}.",
  "app.orders.places.max": "אפשר עד 60 שולחנות.",
  "app.orders.places.empty": "עוד אין שולחנות.",
  "app.orders.import.existing":
    "בתפריט כבר יש {items, plural, one {מנה אחת} other {# מנות}} ב{categories, plural, one {קטגוריה אחת} other {-# קטגוריות}}. מה שמדביקים נוסף אליהן.",
  "app.orders.import.hint":
    "שורה עם מחיר בסוף היא מנה. שורה בלי מחיר היא קטגוריה לשורות שאחריה. שני מחירים עם / הם שני גדלים, ושורה שמתחילה ב-+ היא תוספת למנה שמעליה.",
  "app.orders.import.counts":
    "{items, plural, one {מנה אחת} other {# מנות}} · {categories, plural, one {קטגוריה אחת} other {# קטגוריות}} · {problems, plural, =0 {אין שורות לתיקון} one {שורה אחת לתיקון} other {# שורות לתיקון}}",
  "app.orders.import.line.item": "מנה · <ltr>{price}</ltr>",
  "app.orders.import.line.extra": "תוספת למנה שמעליה · <ltr>+{price}</ltr>",
  "app.orders.import.line.known": "כבר בתפריט, לא נכנסת שוב",
  "app.orders.import.problem.noItem": "תוספת בלי מנה מעליה",
  "app.orders.import.problem.tooManyExtras": "יותר מדי תוספות למנה אחת",
  "app.orders.import.tooMany":
    "עם ההדבקה הזאת יהיו בתפריט יותר מ-300 מנות או 30 קטגוריות. מקצרים אותה.",
  "app.orders.import.action":
    "{count, plural, one {הוספת מנה אחת לתפריט} other {הוספת # מנות לתפריט}}",
  "app.orders.import.done":
    "{items, plural, one {נוספה לתפריט מנה אחת} other {נוספו לתפריט # מנות}}{categories, plural, =0 {} one { וקטגוריה חדשה אחת} other { ו-# קטגוריות חדשות}}",
  "app.manage.roles.editHint.order_taking":
    'בלי עריכה רואים את התפריט, מקבלים הזמנות אם הם במחלקה שמקבלת הזמנות, מבטלים מנה שעוד לא מוכנה ומסמנים "מוכן" ו"נגמר" למה שהמחלקה שלהם מכינה. עם עריכה גם מקבלים הזמנות מכל מחלקה, מבטלים מנה מוכנה, נותנים על חשבון הבית ועורכים את התפריט, המחירים והשולחנות.',
  "app.manage.activity.actions.menu.itemCreate": "הוספת המנה {name} לתפריט",
  "app.manage.activity.actions.menu.itemSave": "שינוי במנה {name}",
  "app.manage.activity.actions.menu.itemArchive": "הסרת המנה {name} מהתפריט",
  "app.manage.activity.actions.menu.itemRestore": "החזרת המנה {name} לתפריט",
  "app.manage.activity.actions.menu.import":
    "{count, plural, one {יבוא מנה אחת לתפריט} other {יבוא # מנות לתפריט}}",
  "app.manage.activity.actions.menu.places.title": "שינוי בשולחנות",
  "app.manage.activity.actions.menu.places.added":
    "{count, plural, one {שולחן אחד נוסף} other {# שולחנות נוספו}}",
  "app.manage.activity.actions.menu.places.archived":
    "{count, plural, one {שולחן אחד הוסר} other {# שולחנות הוסרו}}",
  "app.manage.activity.actions.menu.places.restored":
    "{count, plural, one {שולחן אחד חזר} other {# שולחנות חזרו}}",
  "app.manage.activity.actions.menu.places.changed":
    "{count, plural, one {שולחן אחד שונה} other {# שולחנות שונו}}",
  "app.manage.departments.menuItems":
    "{count, plural, one {מכינים כאן מנה אחת מהתפריט} other {מכינים כאן # מנות מהתפריט}}",
  "app.manage.departments.removedMenu":
    "{count, plural, one {המחלקה {name} הוסרה. מנה אחת מהתפריט לא מגיעה עכשיו להכנה, עד שבוחרים לה מחלקה.} other {המחלקה {name} הוסרה. # מנות מהתפריט לא מגיעות עכשיו להכנה, עד שבוחרים להן מחלקה.}}",
  "modules.order_taking.mode.places": "שולחנות",
  "app.orders.place.numbered": "שולחן {name}",
  "app.orders.place.kind": "שולחן",
  "app.orders.place.takeaway": "לקחת {number}",
  "app.orders.place.takeawayKind": "לקחת",
  "app.orders.place.newTakeaway": "לקחת · הזמנה חדשה",
  "app.orders.floor.title": "שולחנות",
  "app.orders.floor.takeaway": "פתיחת הזמנה לקחת",
  "app.orders.floor.places": "השולחנות",
  "app.orders.floor.takeaways": "לקחת",
  "app.orders.floor.status.ready":
    "{count, plural, one {שולחן אחד מוכן להגשה} other {# מוכנים להגשה}}",
  "app.orders.floor.status.free": "כל השולחנות פנויים",
  "app.orders.floor.state.draft":
    "{count, plural, one {מנה אחת בטיוטה} other {# מנות בטיוטה}}",
  "app.orders.floor.table.place": "שולחן",
  "app.orders.floor.empty.title": "עוד אין שולחנות",
  "app.orders.floor.empty.body":
    "מוסיפים את השולחנות: מספרים או שמות, כמו בר 3.",
  "app.orders.floor.empty.action": "הוספת שולחנות",
  "app.orders.floor.empty.waiter":
    "מי שמנהל את התפריט עוד לא הוסיף שולחנות. בינתיים פותחים הזמנה לקחת.",
  "app.orders.order.free": "פנוי · בוחרים מנות ושולחים",
  "app.orders.order.floorList": "השולחנות",
  "app.orders.order.view.add": "הוספת מנות",
  "app.orders.order.view.unsent":
    "{count, plural, one {מנה אחת עוד לא נשלחה} other {# מנות עוד לא נשלחו}}",
  "app.orders.order.noPlace.title": "השולחן הזה לא נמצא",
  "app.orders.order.noPlace.back": "חזרה לשולחנות",
  "app.orders.picker.title": "הוספת מנות",
  "app.orders.picker.searchPlaceholder": "חיפוש מנה",
  "app.orders.picker.nothingFound": "אין מנה שמתחילה ב-{query}",
  "app.orders.picker.needsChoice": "יש לה בחירות. בינתיים מוסרים אותה בעל פה.",
  "app.orders.picker.noRoute": "אין מחלקה שמכינה אותה",
  "app.orders.picker.noMenu.body":
    "מוסיפים מנות, או מעתיקים תפריט קיים בהדבקה.",
  "app.orders.draft.empty":
    "עוד לא נבחרו מנות. מה שנבחר מהתפריט מופיע כאן, ונשלח בלחיצה אחת.",
  "app.orders.send.count":
    "{count, plural, one {מנה אחת} two {שתי מנות} other {# מנות}}",
  "app.orders.mine.empty.body": "מה ששולחים מהשולחנות מופיע כאן, והמוכן קודם.",
  "app.orders.mine.empty.action": "מעבר לשולחנות",
  "app.orders.offClock.title": "מצב מלצרות נפתח בזמן משמרת",
  "app.orders.failed.moved":
    "ההזמנה עברה לשולחן אחר בינתיים. בוחרים שוב מהרשימה.",
  "app.orders.failed.off": "מצב מלצרות כבוי בעסק הזה.",
  "app.orders.home.open": "פתיחת מצב מלצרות",
  "app.orders.home.idle": "בוחרים שולחן ושולחים להכנה",
};
