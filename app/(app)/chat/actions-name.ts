import { chatPreview } from "@domain/chat";
import { chatDay, chatShortDate } from "@domain/chat-days";

/** How much of a message its actions button's name says: its first words. */
export const ACTIONS_NAME_WORDS = 40;

/**
 * A day or a time in words that aren't drawn (a button's name): in Unicode
 * isolates, as `<ltr>` holds them on screen.
 */
const isolate = (chunks: string) => `⁦${chunks}⁩`;

/**
 * What a message's actions button says of it after whose it is
 * (`app.chat.messageActions.openFor` and `openForOwn`): when it was sent,
 * with its day when that isn't today ("אתמול", "1.11"), and its first
 * words. So the buttons of one person's run of messages in a minute, or of
 * messages at the same time on two days, read apart in a list of the
 * page's buttons. `day` and `today` are YYYY-MM-DD on the business's clock,
 * `time` as the bubble shows it ("08:14"), `words` the message as its
 * actions sheet quotes it.
 */
export function actionsNameValues({
  day,
  today,
  time,
  words,
}: {
  day: string;
  today: string;
  time: string;
  words: string;
}) {
  const which = chatDay(day, today);
  return {
    when: which.kind,
    date: which.kind === "date" ? chatShortDate(day, today) : "",
    time,
    words: chatPreview(words, ACTIONS_NAME_WORDS),
    ltr: isolate,
  };
}
