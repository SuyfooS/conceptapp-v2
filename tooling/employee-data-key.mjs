// Makes a key for the hiring file's encryption (profile H4), with Node's own
// crypto and nothing else:
//
//   node tooling/employee-data-key.mjs            two lines to keep out of chats and files
//   node tooling/employee-data-key.mjs --env      the same two lines, for $GITHUB_ENV
//   node tooling/employee-data-key.mjs --id 2     the next key of a rotation
//
// EMPLOYEE_DATA_KEKS is `id:base64` of 32 random bytes (a rotation lists the
// old keys before it, comma separated, and moves EMPLOYEE_DATA_KEK_ACTIVE to
// the new id). A fresh key every run: never reuse a development key in
// production, and keep the production one in a password manager too, since a
// lost key makes every file unreadable.
import { randomBytes } from "node:crypto";

const at = process.argv.indexOf("--id");
const id = at === -1 ? 1 : Number(process.argv[at + 1]);
if (!Number.isInteger(id) || id < 1 || id > 32767) {
  console.error("--id takes a key id from 1 to 32767");
  process.exit(1);
}

const lines = [
  `EMPLOYEE_DATA_KEKS=${id}:${randomBytes(32).toString("base64")}`,
  `EMPLOYEE_DATA_KEK_ACTIVE=${id}`,
];

if (!process.argv.includes("--env")) {
  console.error(
    "A new key for the hiring file. It is a secret: put it in .env.local or Vercel (Sensitive, Production only), never in a chat or the repo, and keep a copy in a password manager.",
  );
}
console.log(lines.join("\n"));
