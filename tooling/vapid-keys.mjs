// Makes a VAPID key pair for notifications on the phone (RFC 8292), with
// Node's own crypto and nothing else:
//
//   node tooling/vapid-keys.mjs          two lines to keep out of chats and files
//   node tooling/vapid-keys.mjs --env    the same two lines, for $GITHUB_ENV
//
// VAPID_PUBLIC_KEY is the P-256 point, uncompressed (0x04, x, y), base64url;
// VAPID_PRIVATE_KEY its private scalar, base64url. A fresh pair every run:
// never reuse a development pair in production.
import { generateKeyPairSync } from "node:crypto";

const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const jwk = privateKey.export({ format: "jwk" });
const point = Buffer.concat([
  Buffer.from([4]),
  Buffer.from(jwk.x, "base64url"),
  Buffer.from(jwk.y, "base64url"),
]);

const lines = [
  `VAPID_PUBLIC_KEY=${point.toString("base64url")}`,
  `VAPID_PRIVATE_KEY=${jwk.d}`,
];

if (!process.argv.includes("--env")) {
  console.error(
    "A new VAPID key pair. The private key is a secret: put it in .env.local or Vercel (Sensitive), never in a chat or the repo.",
  );
}
console.log(lines.join("\n"));
