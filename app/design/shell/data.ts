// Mock data for the layout demo. Fictional restaurant and people.

export const business = { name: "מסעדת הדגמה" };
export const user = { name: "שירן", role: "מנהלת משמרת" };

export type Staff = { id: string; name: string; role: string };

export const staff: Staff[] = [
  { id: "noa", name: "נועה כהן", role: "מלצרית" },
  { id: "yoav", name: "יואב לוי", role: "ברמן" },
  { id: "maya", name: "מאיה פרץ", role: "מלצרית" },
  { id: "itay", name: "איתי מזרחי", role: "טבח" },
  { id: "shira", name: "שירה ביטון", role: "מארחת" },
  { id: "omer", name: "עומר אזולאי", role: "טבח" },
  { id: "dana", name: "דנה אברהם", role: "מלצרית" },
  { id: "ron", name: "רון שפירא", role: "ברמן" },
];

export const byId = Object.fromEntries(staff.map((s) => [s.id, s])) as Record<
  string,
  Staff
>;

export const initials = (name: string) =>
  name
    .split(" ")
    .map((p) => p[0])
    .join("");

export const firstName = (name: string) => name.split(" ")[0] ?? name;

export type ShiftType = {
  key: "m" | "e";
  name: string;
  time: string;
  hours: number;
  needed: number;
};

const weekday: ShiftType[] = [
  { key: "m", name: "בוקר", time: "09:00–16:00", hours: 7, needed: 3 },
  { key: "e", name: "ערב", time: "16:00–23:30", hours: 7.5, needed: 4 },
];

export type Day = {
  key: string;
  label: string;
  long: string;
  date: string;
  shifts: ShiftType[];
};

// Week of 18–24 October 2026. Friday closes early, Saturday opens after Shabbat.
export const days: Day[] = [
  { key: "sun", label: "א׳", long: "ראשון", date: "18", shifts: weekday },
  { key: "mon", label: "ב׳", long: "שני", date: "19", shifts: weekday },
  { key: "tue", label: "ג׳", long: "שלישי", date: "20", shifts: weekday },
  { key: "wed", label: "ד׳", long: "רביעי", date: "21", shifts: weekday },
  { key: "thu", label: "ה׳", long: "חמישי", date: "22", shifts: weekday },
  {
    key: "fri",
    label: "ו׳",
    long: "שישי",
    date: "23",
    shifts: [
      { key: "m", name: "בוקר", time: "08:00–14:30", hours: 6.5, needed: 5 },
    ],
  },
  {
    key: "sat",
    label: "ש׳",
    long: "מוצאי שבת",
    date: "24",
    shifts: [
      { key: "e", name: "מוצ״ש", time: "19:30–00:00", hours: 4.5, needed: 4 },
    ],
  },
];

export const assignments: Record<
  string,
  Partial<Record<"m" | "e", string[]>>
> = {
  sun: { m: ["noa", "itay", "shira"], e: ["maya", "yoav", "omer", "dana"] },
  mon: { m: ["dana", "itay"], e: ["noa", "ron", "omer", "shira"] },
  tue: { m: ["maya", "itay", "shira"], e: ["noa", "yoav", "omer", "dana"] },
  wed: { m: ["noa", "omer"], e: ["maya", "ron", "itay", "shira"] },
  thu: {
    m: ["dana", "itay", "shira"],
    e: ["noa", "maya", "yoav", "omer", "ron"],
  },
  fri: { m: ["noa", "maya", "itay", "yoav", "shira"] },
  sat: { e: ["dana", "ron", "omer", "shira"] },
};

export const missingAvailability = ["ron", "dana"];

export function assigned(day: Day, shift: ShiftType): string[] {
  return assignments[day.key]?.[shift.key] ?? [];
}

export function openSlots(day: Day): number {
  return day.shifts.reduce(
    (n, s) => n + Math.max(0, s.needed - assigned(day, s).length),
    0,
  );
}

/** The shift a person works on a day, if any. */
export function shiftFor(personId: string, day: Day): ShiftType | undefined {
  return day.shifts.find((s) => assigned(day, s).includes(personId));
}

export function weeklyHours(personId: string): number {
  return days.reduce((h, d) => h + (shiftFor(personId, d)?.hours ?? 0), 0);
}

export const totalOpenSlots = days.reduce((n, d) => n + openSlots(d), 0);

// "Today" for the home screen: Tuesday 13 October, morning shift.
export const onShiftNow = [
  { id: "noa", in: "08:57" },
  { id: "itay", in: "09:02" },
  { id: "shira", in: null },
] as const;

export const tonight = {
  bookings: 14,
  covers: 46,
  next: [
    { time: "19:00", name: "משפחת לוי", party: 6, table: "שולחן 12" },
    { time: "19:30", name: "כהן", party: 2, table: "שולחן 4" },
    { time: "20:00", name: "אברהם", party: 4, table: "שולחן 7" },
    { time: "20:30", name: "גבאי", party: 8, table: "חדר פרטי" },
  ],
};

export const activity = [
  { time: "09:02", text: "איתי מזרחי החתים כניסה" },
  { time: "08:57", text: "נועה כהן החתימה כניסה" },
  { time: "08:40", text: "הזמנה חדשה: גבאי, 8 סועדים, 20:30" },
  { time: "אתמול", text: "מאיה פרץ הגישה זמינות לשבוע הבא" },
  { time: "אתמול", text: "הסידור לשבוע הנוכחי פורסם" },
];
