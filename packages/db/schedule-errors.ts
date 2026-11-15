/**
 * What the database says when a week saved or published holds someone no
 * longer on the team (`private.replace_week_schedule`, 22023) or off the
 * staff (`private.refuse_non_staff`, 42501): a builder opened before they
 * were taken off it (20261114000100_team_changes.sql). Both sentences are
 * pinned by pgTAP (team_changes.test.sql and payroll_access.test.sql), so a
 * migration that rewords one fails there before the screen loses its words.
 */
const OFF_THE_TEAM = [
  "Only active members of the business can work a shift",
  "An accountant is not on the staff",
];

/**
 * The save or publish failed because someone on the week left the team or
 * the staff since the screen was drawn (`saveWeekSchedule` and
 * `publishWeekSchedule` in ./schedule throw the database's message): the
 * screen asks to be read again, and their shifts then show as missing.
 */
export function scheduleTeamChanged(error: unknown): boolean {
  return (
    error instanceof Error &&
    OFF_THE_TEAM.some((message) => error.message.includes(message))
  );
}
