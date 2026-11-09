import { createPublicKey, verify } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";

/**
 * A push service on the loopback (PUSH_TEST_ORIGIN, never on Vercel), for the
 * browser tests: it records every push the app sends and checks it the way a
 * real one does (RFC 8030 and 8292). It answers 201, or what the test asks.
 */

export type SeenPush = {
  path: string;
  /** What was wrong with it; empty for a push a real service would take. */
  problems: string[];
};

function read(request: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

/** What a push service checks of one push. */
export function checkPush(
  request: { method?: string; headers: IncomingMessage["headers"] },
  body: Buffer,
  expected: { publicKey: string; audience: string },
  now = Date.now(),
): string[] {
  const problems: string[] = [];
  if (request.method !== "POST") problems.push(`method ${request.method}`);
  const authorization = String(request.headers.authorization ?? "");
  const match = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(
    authorization,
  );
  if (!match) {
    problems.push("no vapid authorization");
  } else {
    const [, header = "", claims = "", signature = "", k = ""] = match;
    if (k !== expected.publicKey) problems.push("k is not VAPID_PUBLIC_KEY");
    const point = Buffer.from(k, "base64url");
    try {
      const key = createPublicKey({
        format: "jwk",
        key: {
          kty: "EC",
          crv: "P-256",
          x: point.subarray(1, 33).toString("base64url"),
          y: point.subarray(33).toString("base64url"),
        },
      });
      const signed = verify(
        "sha256",
        Buffer.from(`${header}.${claims}`),
        { key, dsaEncoding: "ieee-p1363" },
        Buffer.from(signature, "base64url"),
      );
      if (!signed) problems.push("the token does not verify");
    } catch {
      problems.push("k is not a P-256 key");
    }
    try {
      const head = JSON.parse(Buffer.from(header, "base64url").toString());
      if (head.alg !== "ES256" || head.typ !== "JWT") {
        problems.push("header is not JWT/ES256");
      }
      const said = JSON.parse(Buffer.from(claims, "base64url").toString());
      if (said.aud !== expected.audience) problems.push(`aud ${said.aud}`);
      const left = Number(said.exp) - now / 1000;
      if (!(left > 0 && left <= 24 * 3600)) problems.push(`exp in ${left}s`);
      if (typeof said.sub !== "string" || !/^(mailto:|https:)/.test(said.sub)) {
        problems.push("no sub");
      }
    } catch {
      problems.push("the token is not JSON");
    }
  }
  if (!/^\d+$/.test(String(request.headers.ttl ?? ""))) problems.push("no TTL");
  if (!request.headers.topic) problems.push("no Topic");
  if (body.length > 0) problems.push(`a body of ${body.length} bytes`);
  if (request.headers["content-encoding"]) problems.push("Content-Encoding");
  return problems;
}

export class MockPushService {
  readonly seen: SeenPush[] = [];
  /** The status the next pushes get. */
  status = 201;
  private server: Server | null = null;

  constructor(
    private readonly origin: string,
    private readonly publicKey: string,
  ) {}

  async start(): Promise<void> {
    const { hostname, port } = new URL(this.origin);
    this.server = createServer(async (request, response) => {
      const body = await read(request);
      this.seen.push({
        path: request.url ?? "",
        problems: checkPush(request, body, {
          publicKey: this.publicKey,
          audience: this.origin,
        }),
      });
      response.writeHead(this.status).end();
    });
    await new Promise<void>((resolve, reject) => {
      this.server?.once("error", reject);
      this.server?.listen(Number(port), hostname, resolve);
    });
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => {
      if (!this.server) return resolve();
      this.server.close(() => resolve());
    });
    this.server = null;
  }
}
