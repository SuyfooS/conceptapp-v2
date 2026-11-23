import { type FileReview, orderFileReviews } from "@domain/file-holders";
import { formArg } from "@domain/profile";
import type { TeamMember } from "@domain/team";
import { ListGroup, ListRow } from "@ui/list-row";
import { PersonAvatar } from "@ui/person-row";
import type { Translator } from "../wording";

/** How many people the card names; the rest are counted, on the team screen. */
export const FILE_REVIEWS_SHOWN = 3;

/**
 * Today's accounts to look at, for an owner (profile H6b-1, default 9):
 * "חשבונות בנק לבדיקה" while any manager's or worker's account waits, up to
 * three people, the person's own "לא שיניתי" first, then a number the bank's
 * check doubts, then new ones, by name within each, each leading to their
 * file; past three, a row counts the rest on the team screen. A quiet list:
 * the first steps or an open mode keep the screen's one accent. The same in
 * every shape. Someone not among the team's members now (a race) is left
 * out, and with nobody left there is no card.
 */
export function FileReviewsSection({
  t,
  reviews,
  members,
  path,
}: {
  t: Translator<"app">;
  reviews: readonly FileReview[];
  members: readonly TeamMember[];
  /** A route in the app, or in the demo. */
  path: (to: string) => string;
}) {
  const byId = new Map(members.map((member) => [member.userId, member]));
  const shown = orderFileReviews(
    reviews.filter((review) => byId.has(review.userId)),
    new Map(members.map((member) => [member.userId, member.name])),
  );
  if (shown.length === 0) return null;
  const rest = shown.length - FILE_REVIEWS_SHOWN;
  return (
    <section
      aria-labelledby="file-reviews-title"
      className="flex min-w-0 flex-col gap-3 md:max-w-2xl"
    >
      <h2 id="file-reviews-title" className="px-1 font-bold text-lg">
        {t("home.fileReviews.title", { count: shown.length })}
      </h2>
      <p className="px-1 text-ink-2">{t("home.fileReviews.body")}</p>
      <ListGroup>
        {shown.slice(0, FILE_REVIEWS_SHOWN).map(({ userId, review }) => {
          const member = byId.get(userId);
          const name = member?.name ?? t("team.noName");
          return (
            <ListRow
              key={userId}
              href={path(`/team/${userId}/file`)}
              leading={
                <PersonAvatar
                  name={member?.name ?? null}
                  photo={member?.photo}
                />
              }
              title={name}
              subtitle={
                review === "disputed"
                  ? t("home.fileReviews.disputed", {
                      form: formArg(member?.addressForm ?? null),
                    })
                  : t(`home.fileReviews.${review}`)
              }
            />
          );
        })}
        {rest > 0 ? (
          <ListRow
            href={path("/team")}
            title={t("home.fileReviews.more", { count: rest })}
          />
        ) : null}
      </ListGroup>
    </section>
  );
}
