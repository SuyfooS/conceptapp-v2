import { describe, expect, it } from "vitest";
import { loopbackOrigin, pushEndpointOf } from "./push-endpoint";

const ok = (raw: string, testOrigin?: string | null) =>
  pushEndpointOf(raw, { testOrigin })?.href ?? null;

describe("pushEndpointOf", () => {
  it("takes the push services browsers use", () => {
    for (const raw of [
      "https://fcm.googleapis.com/fcm/send/dXk3:APA91bH",
      "https://fcm.googleapis.com/wp/dXk3",
      "https://android.googleapis.com/gcm/send/abc",
      "https://updates.push.services.mozilla.com/wpush/v2/gAAAAA",
      "https://web.push.apple.com/QGuQyavXutnMH",
      "https://api.push.apple.com/3/device/abc",
      "https://db5p.notify.windows.com/w/?token=BQYAAA",
      "https://FCM.googleapis.com/fcm/send/abc",
      "https://fcm.googleapis.com:443/fcm/send/abc",
    ]) {
      expect(ok(raw), raw).not.toBeNull();
    }
  });

  it("refuses anything else the server would be made to call", () => {
    for (const raw of [
      // Not https, another port, or someone else's host.
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://fcm.googleapis.com:8443/fcm/send/abc",
      "https://evil.example/push",
      "https://fcm.googleapis.com.evil.example/x",
      "https://evilfcm.googleapis.com/x",
      "https://push.apple.com/x",
      "https://notify.windows.com/x",
      "https://xpush.apple.com.evil.example/x",
      "https://fcm.googleapis.com./x",
      // Internal addresses.
      "https://127.0.0.1/push",
      "https://169.254.169.254/latest/meta-data",
      "https://localhost/push",
      "https://[::1]/push",
      // Credentials, a fragment, whitespace, control characters, backslashes.
      "https://user:pass@fcm.googleapis.com/x",
      "https://fcm.googleapis.com/x#y",
      "https://fcm.googleapis.com/x y",
      "https://fcm.googleapis.com/x\ny",
      "https:\\\\fcm.googleapis.com\\x",
      // Not a URL, or not a string.
      "fcm.googleapis.com/x",
      "",
    ]) {
      expect(ok(raw), raw).toBeNull();
    }
    expect(pushEndpointOf(null)).toBeNull();
    expect(pushEndpointOf(42)).toBeNull();
    expect(
      pushEndpointOf(`https://fcm.googleapis.com/${"a".repeat(1100)}`),
    ).toBeNull();
  });

  it("takes the browser tests' mock only when told to", () => {
    const mock = "http://127.0.0.1:3199/push/abc";
    expect(ok(mock)).toBeNull();
    expect(ok(mock, null)).toBeNull();
    expect(ok(mock, "http://127.0.0.1:3199")).toBe(mock);
    // Its origin exactly: not another port, not another host.
    expect(ok("http://127.0.0.1:3200/push/abc", "http://127.0.0.1:3199")).toBe(
      null,
    );
    expect(ok("http://localhost:3199/push/abc", "http://127.0.0.1:3199")).toBe(
      null,
    );
  });
});

describe("loopbackOrigin", () => {
  it("takes a loopback origin", () => {
    expect(loopbackOrigin("http://127.0.0.1:3199")).toBe(
      "http://127.0.0.1:3199",
    );
    expect(loopbackOrigin("http://localhost:3199/")).toBe(
      "http://localhost:3199",
    );
  });

  it("refuses anything that isn't one", () => {
    for (const raw of [
      undefined,
      "",
      "http://10.0.0.1:3199",
      "https://fcm.googleapis.com",
      "http://127.0.0.1:3199/push",
      "http://user@127.0.0.1:3199",
      "file:///etc/passwd",
      "not a url",
    ]) {
      expect(loopbackOrigin(raw), String(raw)).toBeNull();
    }
  });
});
