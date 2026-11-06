import { describe, expect, it } from "vitest";
import {
  checkProfilePhoto,
  isProfilePhotoPath,
  PROFILE_PHOTO_MAX_BYTES,
  profilePhotoPath,
  sniffPhotoType,
} from "./profile-photos";

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const png = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0,
]);
const webp = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50,
]);
const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
const wav = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x41, 0x56, 0x45,
]);

describe("sniffPhotoType", () => {
  it("reads JPEG, PNG and WebP from their first bytes", () => {
    expect(sniffPhotoType(jpeg)).toBe("image/jpeg");
    expect(sniffPhotoType(png)).toBe("image/png");
    expect(sniffPhotoType(webp)).toBe("image/webp");
  });

  it("refuses other files, including other RIFF files", () => {
    expect(sniffPhotoType(gif)).toBeNull();
    expect(sniffPhotoType(wav)).toBeNull();
    expect(sniffPhotoType(new Uint8Array())).toBeNull();
  });
});

describe("checkProfilePhoto", () => {
  it("accepts a photo whose bytes match its type", () => {
    expect(
      checkProfilePhoto({ type: "image/png", size: png.length, bytes: png }),
    ).toEqual({
      ok: true,
      type: "image/png",
      extension: "png",
    });
    expect(
      checkProfilePhoto({ type: "image/webp", size: webp.length, bytes: webp }),
    ).toMatchObject({ ok: true, extension: "webp" });
  });

  it("refuses a type the browser claims but the bytes deny", () => {
    expect(
      checkProfilePhoto({ type: "image/jpeg", size: gif.length, bytes: gif }),
    ).toEqual({
      ok: false,
      problem: "type",
    });
    expect(
      checkProfilePhoto({ type: "image/png", size: jpeg.length, bytes: jpeg }),
    ).toEqual({
      ok: false,
      problem: "type",
    });
    expect(
      checkProfilePhoto({ type: "image/gif", size: gif.length, bytes: gif }),
    ).toEqual({
      ok: false,
      problem: "type",
    });
  });

  it("refuses an empty file", () => {
    expect(
      checkProfilePhoto({
        type: "image/png",
        size: 0,
        bytes: new Uint8Array(),
      }),
    ).toEqual({ ok: false, problem: "empty" });
  });

  it("takes 2MB and refuses a byte more", () => {
    const at = (size: number) => {
      const bytes = new Uint8Array(size);
      bytes.set(jpeg);
      return checkProfilePhoto({ type: "image/jpeg", size, bytes });
    };
    expect(at(PROFILE_PHOTO_MAX_BYTES).ok).toBe(true);
    expect(at(PROFILE_PHOTO_MAX_BYTES + 1)).toEqual({
      ok: false,
      problem: "tooBig",
    });
  });
});

describe("profile photo paths", () => {
  const user = "69000000-0000-4000-a000-00000000000b";

  it("puts a photo in the person's folder", () => {
    const path = profilePhotoPath(user, "abcdefgh12", "jpg");
    expect(path).toBe(`${user}/abcdefgh12.jpg`);
    expect(isProfilePhotoPath(user, path)).toBe(true);
  });

  it("refuses another folder, other types, short keys and subfolders", () => {
    expect(
      isProfilePhotoPath(
        user,
        "69000000-0000-4000-a000-00000000000a/abcdefgh.jpg",
      ),
    ).toBe(false);
    expect(isProfilePhotoPath(user, `${user}/abcdefgh.gif`)).toBe(false);
    expect(isProfilePhotoPath(user, `${user}/abc.jpg`)).toBe(false);
    expect(isProfilePhotoPath(user, `${user}/x/abcdefgh.jpg`)).toBe(false);
  });
});
