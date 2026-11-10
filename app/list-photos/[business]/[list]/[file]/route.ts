import { listPhotoBytes } from "@db/list-photos";
import { isUuid } from "@domain/activity";
import { isListPhotoFile, isListPhotoPath } from "@domain/list-photos";

/** Nothing here for this person: the same answer whether it exists or not. */
function missing(): Response {
  return new Response(null, {
    status: 404,
    headers: { "Cache-Control": "private, no-store" },
  });
}

/**
 * A list's photo (L6), as the signed-in person may see it (`listPhotoSrc`
 * points here), the way /photos serves profile photos. Downloaded under their
 * own session, so the bucket's policy decides: a list they see (they hold it,
 * sent it, asked for it, or manage lists), of their business, with lists on
 * there, and an item of it pointing at the file. Anything else, another
 * business's photo included, is not found. The browser keeps it privately for
 * an hour (a new photo gets a new random path, so it is never stale), never
 * through the image optimizer, and never reads it as anything but a picture.
 */
export async function GET(
  _request: Request,
  {
    params,
  }: { params: Promise<{ business: string; list: string; file: string }> },
): Promise<Response> {
  const { business, list, file } = await params;
  // Each part on its own first: the path rule alone would read a crafted
  // name differently from the folders it is given.
  if (
    !isUuid(business) ||
    !isUuid(list) ||
    business !== business.toLowerCase() ||
    list !== list.toLowerCase() ||
    !isListPhotoFile(file)
  ) {
    return missing();
  }
  const path = `${business}/${list}/${file}`;
  if (!isListPhotoPath(path, { businessId: business, listId: list })) {
    return missing();
  }

  const photo = await listPhotoBytes(path);
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
