/**
 * The console import twin's own paste (/design/console/businesses/…/
 * people/import?state=elsewhere): a shop's evening staff as its sheet is
 * copied, made-up names and numbers (054-710-56xx), and one line for the
 * owner of another of the console twin's businesses (Maya Peretz, of
 * "השולחן של סבתא", in ../../../../data.ts), whom the console's database
 * refuses on a second staff.
 */
export const elsewherePaste = [
  ["שם", "נייד", "תפקיד"].join("\t"),
  ["אלון מור", "054-710-5601", "ניהול"].join("\t"),
  ["מאיה פרץ", "054-123-4562", ""].join("\t"),
  ["שירה טל", "054-710-5602", ""].join("\t"),
  ["רועי בן חיים", "054-710-5603", ""].join("\t"),
].join("\n");
