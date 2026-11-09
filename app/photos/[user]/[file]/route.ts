import { profilePhotoBytes } from "@db/profile-photos";
import { isUuid } from "@domain/activity";
import { isProfilePhotoPath } from "@domain/profile-photos";

/** Nothing here for this person: the same answer whether it exists or not. */
function missing(): Response {
  return new Response(null, {
    status: 404,
    headers: { "Cache-Control": "private, no-store" },
  });
}

/**
 * A profile photo, as the signed-in person may see it (`profilePhotoSrc`
 * points here). Downloaded under their own session, so Storage's policies
 * decide: their own photo and their colleagues', nobody else's. A route
 * rather than signed links in the page: no Storage round trip while a page
 * renders, nothing from Supabase in the HTML, a stable address the browser
 * keeps privately (a new photo gets a new random path, so it is never stale),
 * and same-origin bytes the profile can read back for its undo.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ user: string; file: string }> },
): Promise<Response> {
  const { user, file } = await params;
  const path = `${user}/${file}`;
  // The folder must be a user id: the path rule alone compares the folder
  // with the one it is given, which would let ".." through.
  if (!isUuid(user) || !isProfilePhotoPath(user, path)) return missing();

  const photo = await profilePhotoBytes(path);
  if (!photo) return missing();
  return new Response(photo.bytes, {
    status: 200,
    headers: {
      "Content-Type": photo.type,
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
