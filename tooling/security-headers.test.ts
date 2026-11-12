import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FILE_CONTENT_POLICY,
  FILE_ROUTES,
  headerRules,
  NOINDEX,
  OUT_OF_SEARCH,
  PERMISSIONS_POLICY,
} from "@domain/security-headers";
import { describe, expect, it } from "vitest";
import robots from "../app/robots";
import nextConfig from "../next.config";
import { sourceFiles } from "./boundaries";

// The security check of 8 November 2026 (#80): the headers every response
// carries, robots.txt, and the session cookies only the server reads.
const root = join(__dirname, "..");
const code = ["app", "packages", "modules"].flatMap((dir) =>
  sourceFiles(dir, root)
    .filter((file) => !/\.test\.tsx?$/.test(file))
    .map((file) => ({ file, source: readFileSync(join(root, file), "utf8") })),
);

const allowed = new Map(
  PERMISSIONS_POLICY.split(", ").map((entry) => {
    const [feature, allow] = entry.split("=");
    return [feature, allow];
  }),
);

describe("next.config.ts", () => {
  it("sends the security headers and the service worker's own", async () => {
    expect(await nextConfig.headers?.()).toEqual(headerRules());
  });
});

describe("keeping the design gallery and invite links out of search", () => {
  // A crawler has to fetch a page to see its noindex, so robots.txt must not
  // block one: that would hide the noindex and still let the address be listed.
  it("leaves them crawlable in robots.txt", () => {
    const disallowed = [robots().rules]
      .flat()
      .flatMap((rule) => [rule.disallow ?? []].flat())
      .filter((path) => path !== "");
    for (const path of OUT_OF_SEARCH) {
      // Neither the path nor anything above it, such as "/".
      expect(
        disallowed.filter((d) => path.startsWith(d)),
        path,
      ).toEqual([]);
    }
  });

  it("answers noindex on every page under them", () => {
    const rules = headerRules();
    for (const path of OUT_OF_SEARCH) {
      expect(
        rules.find((rule) => rule.source === `${path}/:path*`)?.headers,
        path,
      ).toContainEqual(NOINDEX);
    }
  });

  it("says noindex in their page metadata too", () => {
    for (const file of [
      "app/design/page.tsx",
      "app/design/shell/layout.tsx",
      "app/design/console/layout.tsx",
      "app/(auth)/join/[token]/page.tsx",
    ]) {
      expect(read(file), file).toMatch(/robots: \{ index: false/);
    }
  });
});

describe("the routes that serve files people sent", () => {
  // No virus scan on the free plan (§6.3 of the chat plan): a file a browser
  // chose to render runs nothing, loads nothing and sits in no frame, and no
  // other site embeds it.
  const rules = headerRules();
  const general = rules.findIndex((rule) => rule.source === "/:path*");

  it("serve chat's files and the documents' under a sandbox, from this site only", () => {
    expect(FILE_ROUTES).toContain("/chat-files");
    expect(FILE_ROUTES).toContain("/document-files");
    for (const path of FILE_ROUTES) {
      const at = rules.findIndex((rule) => rule.source === `${path}/:path*`);
      const headers = rules[at]?.headers ?? [];
      // After the rule for every page, so its policy wins on these paths.
      expect(at, path).toBeGreaterThan(general);
      expect(headers, path).toContainEqual({
        key: "Content-Security-Policy",
        value: FILE_CONTENT_POLICY,
      });
      expect(headers, path).toContainEqual({
        key: "Cross-Origin-Resource-Policy",
        value: "same-origin",
      });
    }
    expect(FILE_CONTENT_POLICY.split("; ")).toEqual([
      "default-src 'none'",
      "sandbox",
      "frame-ancestors 'none'",
    ]);
  });

  it("set the same in the route itself, with the type from the bytes", () => {
    // Whichever of the two a response keeps, it says the same.
    const route = read(
      "app/chat-files/[business]/[conversation]/[file]/route.ts",
    );
    expect(route).toContain('"Content-Security-Policy": FILE_CONTENT_POLICY');
    expect(route).toContain('"Cross-Origin-Resource-Policy": "same-origin"');
    expect(route).toContain('"X-Content-Type-Options": "nosniff"');
    expect(route).toContain('"Cache-Control": "private, max-age=604800"');
    expect(route).toContain('"Content-Type": found.type');
  });

  it("serve a PDF as a download only, typed by its bytes (C5)", () => {
    const route = read(
      "app/chat-files/[business]/[conversation]/[file]/route.ts",
    );
    expect(route).toContain('"Content-Type": CHAT_PDF_TYPE');
    expect(route).toContain(
      '"Content-Disposition": chatPdfDisposition(pdf.name)',
    );
    expect(route).toContain("chatPdfDownload(path)");
    // Both answers carry the sandbox: once for the picture, once for the PDF.
    expect(
      route.split('"Content-Security-Policy": FILE_CONTENT_POLICY').length,
    ).toBe(3);
    expect(route.split('"Content-Disposition": "inline"').length).toBe(2);
  });

  it("serve a document kept by nobody, typed by its bytes, a PDF as a download (C7)", () => {
    // Every answer of /document-files, the 404 too, carries the same headers:
    // no browser cache (a sick note on a shared work phone), the sandbox.
    const served = read("app/document-files/served.ts");
    expect(served).toContain('"Cache-Control": "private, no-store"');
    expect(served).toContain('"X-Content-Type-Options": "nosniff"');
    expect(served).toContain('"Content-Security-Policy": FILE_CONTENT_POLICY');
    expect(served).toContain('"Cross-Origin-Resource-Policy": "same-origin"');
    expect(served).toContain("headers: DOCUMENT_FILE_HEADERS");

    const route = read("app/document-files/[business]/[file]/route.ts");
    // Three answers that serve something, each with the headers.
    expect(route.split("...DOCUMENT_FILE_HEADERS").length).toBe(4);
    expect(route).toContain('"Content-Type": CHAT_PDF_TYPE');
    expect(route).toContain(
      '"Content-Disposition": chatPdfDisposition(stored.name)',
    );
    expect(route).toContain('"Content-Type": stored.type');
    expect(route).toContain('"Content-Type": shown.type');
    // It opens the document (and logs the opening) only for the app's own request.
    expect(route).toContain("if (!mayOpen(request)) return missing();");
    expect(route).toContain("openDocument(place.userId, documentId)");
    expect(route).not.toMatch(/max-age|immutable/);

    const download = read("app/document-files/download/route.ts");
    expect(download).toContain("...DOCUMENT_FILE_HEADERS");
    expect(download).toContain('"Content-Type": "application/zip"');
    expect(download).toContain('disposition: "attachment"');
    // A download opens every document in it: only the page's own form (a
    // POST from the app's own origin) asks for one, never a link.
    expect(download).toMatch(
      /export async function POST\(request: Request\): Promise<Response> \{\n {2}if \(\n {4}!downloadsDocuments\(/,
    );
    expect(download).toContain("await requestOrigin(),");
    expect(download).toMatch(
      /export function GET\(\): Response \{\n {2}return onlyPost\(\);\n\}/,
    );
    expect(download).toMatch(
      /export function HEAD\(\): Response \{\n {2}return onlyPost\(\);\n\}/,
    );
    expect(download).not.toMatch(/max-age|immutable/);
  });
});

describe("Permissions-Policy", () => {
  // A browser API the app calls, and the feature the header must allow for it.
  const uses = [
    { api: /\bgetUserMedia\b/, feature: "camera" },
    { api: /\bwakeLock\.request\b/, feature: "screen-wake-lock" },
    { api: /\brequestFullscreen\b/, feature: "fullscreen" },
    { api: /\bnavigator\.geolocation\b/, feature: "geolocation" },
    { api: /\bPaymentRequest\b/, feature: "payment" },
    { api: /\bnavigator\.usb\b/, feature: "usb" },
  ];

  it("allows on the app's own pages every feature the code asks for", () => {
    for (const { api, feature } of uses) {
      for (const { file } of code.filter((f) => api.test(f.source))) {
        expect(allowed.get(feature), `${feature}, used in ${file}`).toBe(
          "(self)",
        );
      }
    }
  });

  it("finds the camera, the wake lock and full screen where the clock uses them", () => {
    const using = (api: RegExp) =>
      code.filter((f) => api.test(f.source)).map((f) => f.file);
    expect(using(/\bgetUserMedia\b/)).toContain("packages/ui/use-qr-camera.ts");
    expect(using(/\bwakeLock\.request\b/)).toContain(
      "packages/ui/use-wake-lock.ts",
    );
    expect(using(/\brequestFullscreen\b/)).toContain(
      "app/(app)/clock/code/code-screen.tsx",
    );
  });

  it("asks the camera for video only, as the microphone is off", () => {
    expect(allowed.get("microphone")).toBe("()");
    expect(read("packages/ui/qr-camera.ts")).toMatch(/audio: false/);
  });
});

describe("the session cookies", () => {
  // They are httpOnly (packages/db/supabase/cookies.ts): fine only while no
  // script in the browser needs them.
  it("are never read in the browser", () => {
    for (const { file, source } of code) {
      expect(source, file).not.toMatch(/\bcreateBrowserClient\b/);
      expect(source, file).not.toMatch(/\bdocument\.cookie\b/);
    }
  });

  it("are set with the app's options by both server clients", () => {
    for (const file of [
      "packages/db/supabase/server.ts",
      "packages/db/supabase/proxy.ts",
    ]) {
      expect(read(file), file).toMatch(
        /cookieOptions: authCookieOptions(For)?\(/,
      );
    }
  });
});

describe("signing out", () => {
  it("ends this device's session only", () => {
    expect(read("app/(auth)/actions.ts")).toContain(
      'supabase.auth.signOut({ scope: "local" })',
    );
  });
});

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}
