import { describe, expect, it } from "vitest";
import { isSecureRequest, requestProtocol } from "./request-origin";

describe("requestProtocol", () => {
  it("takes what the proxy in front says", () => {
    expect(requestProtocol("www.conceptapp.co.il", "https")).toBe("https");
    expect(requestProtocol("127.0.0.1:3100", "http")).toBe("http");
  });

  it("is http on the machine itself and https elsewhere when nothing is said", () => {
    expect(requestProtocol("localhost:3000", null)).toBe("http");
    expect(requestProtocol("127.0.0.1", undefined)).toBe("http");
    expect(requestProtocol("conceptapp-v2.vercel.app", null)).toBe("https");
    expect(requestProtocol(null, null)).toBe("https");
  });

  it("doesn't take a host that only starts like the machine's", () => {
    expect(requestProtocol("localhost.example.com", null)).toBe("https");
  });
});

describe("isSecureRequest", () => {
  it("is true over https only", () => {
    expect(isSecureRequest("www.conceptapp.co.il", "https")).toBe(true);
    expect(isSecureRequest("conceptapp-v2.vercel.app", null)).toBe(true);
    expect(isSecureRequest("127.0.0.1:3100", "http")).toBe(false);
    expect(isSecureRequest("localhost:3000", null)).toBe(false);
  });
});
