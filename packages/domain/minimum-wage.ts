/**
 * Israel's minimum wage, by date (payroll P4). The Ministry publishes a
 * monthly figure and an hourly one on the 182-hour basis each April; the
 * statute's own basis (186 hours) is kept beside it for the payroll file's
 * notes. Every figure is stored as published, never worked out at run time:
 * 6,443.85 ÷ 182 is 35.4058, published as 35.40, cut and not rounded.
 *
 * Youth (חוק שכר מינימום, s.4; the Minimum Wage (Youth) regulations): 70%
 * under 16, 75% from 16, 83% from 17, and 60% for an apprentice, of the
 * adult monthly figure, then ÷ 173 for the hour. The band follows the exact
 * birthday, so a birthday mid-month changes the minimum on that day (the
 * band is worked out from the person's 18th birthday, from payroll P5).
 *
 * The database keeps the same rows (`public.minimum_wages`, from
 * 20261110000500_hourly_wages.sql), which `minimum-wages.db.test.ts` keeps
 * equal to these. A new April is a new row in both, by PR; from the April
 * after the last row the wage sheet says its minimum may be out of date.
 */

/** Whose minimum: an adult (18 and over), or a minor by age. */
export type AgeBand = "adult" | "17" | "16" | "under16";

export const AGE_BANDS = [
  "adult",
  "17",
  "16",
  "under16",
] as const satisfies readonly AgeBand[];

export type MinimumWageRow = {
  /** The day it takes effect, `YYYY-MM-DD`. */
  from: string;
  monthlyAgorot: number;
  /** The Ministry's 182-hour figure, as published. */
  hourlyAgorot: number;
  /** The statute's 186-hour figure, for the payroll file's notes. */
  statuteHourlyAgorot: number;
  youthHourlyAgorot: Record<Exclude<AgeBand, "adult">, number> & {
    apprentice: number;
  };
  /**
   * The youth figures were read from a publication. False when they were
   * worked out from the percentages instead, and must be checked against the
   * official one before a business pays a minor from them.
   */
  youthPublished: boolean;
  source: string;
};

export const MINIMUM_WAGES: readonly MinimumWageRow[] = [
  {
    from: "2025-04-01",
    monthlyAgorot: 624_767,
    hourlyAgorot: 3_432,
    statuteHourlyAgorot: 3_358,
    // Worked out (70/75/83/60% of 6,247.67, rounded to agorot, ÷ 173, rounded),
    // not read from a publication: check them against the official youth
    // table for 1.4.2025 before a business pays a minor from them
    // (docs/ROADMAP.md, known issues).
    youthHourlyAgorot: {
      under16: 2_528,
      "16": 2_709,
      "17": 2_997,
      apprentice: 2_167,
    },
    youthPublished: false,
    source:
      "National Insurance (BTL) adult figures, 1.4.2025; youth worked out from the percentages",
  },
  {
    from: "2026-04-01",
    monthlyAgorot: 644_385,
    hourlyAgorot: 3_540,
    statuteHourlyAgorot: 3_464,
    youthHourlyAgorot: {
      under16: 2_607,
      "16": 2_794,
      "17": 3_092,
      apprentice: 2_235,
    },
    youthPublished: true,
    source:
      "Reshumot 4.3.2026; Kol Zchut, שכר מינימום (17.8.2026) and שכר מינימום לנוער (21.6.2026)",
  },
];

/** The hourly figure of a row for a band. */
export function hourlyFor(row: MinimumWageRow, band: AgeBand): number {
  return band === "adult" ? row.hourlyAgorot : row.youthHourlyAgorot[band];
}

/**
 * The row in effect on a date (`YYYY-MM-DD`): the latest that starts on or
 * before it. Null before the table's first row.
 */
export function minimumWageRowOn(
  date: string,
  table: readonly MinimumWageRow[] = MINIMUM_WAGES,
): MinimumWageRow | null {
  let found: MinimumWageRow | null = null;
  for (const row of table) {
    if (row.from <= date && (found === null || row.from > found.from)) {
      found = row;
    }
  }
  return found;
}

/**
 * The hourly minimum for a band on a date, in agorot, with the day its row
 * took effect. Null before the table's first row.
 */
export function minimumWageOn(
  date: string,
  band: AgeBand,
  table: readonly MinimumWageRow[] = MINIMUM_WAGES,
): { agorot: number; from: string } | null {
  const row = minimumWageRowOn(date, table);
  return row ? { agorot: hourlyFor(row, band), from: row.from } : null;
}

/** The day the table's newest row took effect; null for an empty table. */
export function minimumWageTableFrom(
  table: readonly MinimumWageRow[] = MINIMUM_WAGES,
): string | null {
  return table.reduce<string | null>(
    (latest, row) => (latest === null || row.from > latest ? row.from : latest),
    null,
  );
}

/**
 * The month (`YYYY-MM`) is on or after the April after the table's last row:
 * a new year's figures are due, and the table hasn't had them yet.
 */
export function minimumWageTableStale(
  month: string,
  table: readonly MinimumWageRow[] = MINIMUM_WAGES,
): boolean {
  const last = minimumWageTableFrom(table);
  if (last === null) return true;
  const year = Number(last.slice(0, 4));
  const april = Number(last.slice(5, 7)) < 4 ? year : year + 1;
  return month >= `${april}-04`;
}
