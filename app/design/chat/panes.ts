/**
 * The chat list beside a conversation, from tablet up: it stays put while
 * the conversation scrolls, and scrolls itself when longer than the screen
 * (above the floating tab bar on tablets). A little room at its sides and
 * foot keeps its cards' shadows.
 */
export const chatPaneClass =
  "md:sticky md:top-8 md:-mx-1 md:max-h-[calc(100dvh-env(safe-area-inset-bottom)-10.5rem)] md:overflow-y-auto md:px-1 md:pb-4 xl:max-h-[calc(100dvh-4rem)]";

/** The desktop's details column, from 1280px, held the same way. */
export const chatDetailsClass =
  "hidden xl:sticky xl:top-8 xl:flex xl:max-h-[calc(100dvh-4rem)] xl:overflow-y-auto xl:pb-4";
