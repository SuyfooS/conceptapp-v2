import { describe, expect, it } from "vitest";
import { scheduleTeamChanged } from "./schedule-errors";

// `saveWeekSchedule` and `publishWeekSchedule` throw the database's message
// after their own words; these are the two that mean someone on the week
// left the team or the staff since the builder was opened.
describe("scheduleTeamChanged", () => {
  it("knows someone no longer on the team, or off the staff", () => {
    expect(
      scheduleTeamChanged(
        new Error(
          "Could not save the schedule: Only active members of the business can work a shift",
        ),
      ),
    ).toBe(true);
    expect(
      scheduleTeamChanged(
        new Error(
          "Could not publish the schedule: An accountant is not on the staff",
        ),
      ),
    ).toBe(true);
  });

  it("leaves every other failure to say it failed", () => {
    expect(
      scheduleTeamChanged(
        new Error(
          "Could not save the schedule: A person works two shifts at once",
        ),
      ),
    ).toBe(false);
    expect(
      scheduleTeamChanged({
        message: "Only active members of the business can work a shift",
      }),
    ).toBe(false);
    expect(scheduleTeamChanged(null)).toBe(false);
  });
});
