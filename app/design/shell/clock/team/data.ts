import type {
  PersonHoursData,
  TeamHoursData,
} from "../../../../(app)/clock/team/team-types";
import { demoRecords } from "../data";

const NOA = "noa";
const YOAV = "yoav";
const SHIRAN = "shiran";

export const demoTeamPaths = {
  clock: "/design/shell/clock",
  team: "/design/shell/clock/team",
  code: "/design/shell/clock/code",
};

export const demoTeamHours: TeamHoursData = {
  month: "2026-11",
  currentMonth: "2026-11",
  minutes: 212 * 60 + 12,
  shifts: 27,
  required: true,
  showCode: true,
  viewOnly: false,
  toConfirm: [
    {
      entryId: "68000000-0000-4000-a000-000000000031",
      userId: YOAV,
      name: "יואב לוי",
      date: "2026-11-05",
      what: "in",
      time: "09:14",
    },
    {
      entryId: "68000000-0000-4000-a000-000000000032",
      userId: NOA,
      name: "נועה כהן",
      date: "2026-11-04",
      what: "both",
      time: "16:00–23:42",
    },
  ],
  atWork: [
    {
      userId: SHIRAN,
      name: "שירן הדגמה",
      since: "08:02",
      onBreak: false,
      month: "2026-11",
      attendance: { how: "typed", pending: false },
    },
    {
      userId: YOAV,
      name: "יואב לוי",
      since: "09:14",
      onBreak: true,
      month: "2026-11",
      attendance: { how: "none", pending: true },
    },
  ],
  overdue: [
    {
      entryId: "68000000-0000-4000-a000-000000000021",
      userId: NOA,
      name: "נועה כהן",
      date: "2026-11-04",
      in: "16:00",
    },
  ],
  people: [
    {
      userId: YOAV,
      name: "יואב לוי",
      former: false,
      minutes: 64 * 60 + 40,
      shifts: 8,
      breakMinutes: 120,
    },
    {
      userId: NOA,
      name: "נועה כהן",
      former: false,
      minutes: 86 * 60 + 30,
      shifts: 11,
      breakMinutes: 180,
    },
    {
      userId: SHIRAN,
      name: "שירן הדגמה",
      former: false,
      minutes: 61 * 60 + 2,
      shifts: 8,
      breakMinutes: 0,
    },
  ],
};

export const demoPersonHours: PersonHoursData = {
  person: { userId: NOA, name: "נועה כהן" },
  month: "2026-11",
  currentMonth: "2026-11",
  minutes: demoRecords.reduce((sum, record) => sum + record.minutes, 0),
  records: [
    {
      id: "68000000-0000-4000-a000-000000000021",
      date: "2026-11-04",
      in: "16:00",
      out: null,
      minutes: 24 * 60,
      breakMinutes: 0,
      byManager: false,
      overdue: true,
      attendance: null,
    },
    ...demoRecords.filter((record) => record.date !== "2026-11-04"),
  ],
  today: "2026-11-06",
  viewOnly: false,
};
