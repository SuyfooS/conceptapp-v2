"use client";

import type { ComponentProps } from "react";
import { NotFoundState } from "../not-found-state";
import { titleTakesFocus } from "./chat-focus";

/**
 * The app's not-found screen where a chat would be: its title takes the
 * focus where a chat's does (`titleTakesFocus`). From tablet up, the row
 * pressed in the list beside it, or "שליחת הודעה", keeps the focus while it
 * comes, and every chat screen has the same page title, so nothing else
 * would say the screen beside the list changed.
 */
export function ChatNotFoundState(
  props: Omit<ComponentProps<typeof NotFoundState>, "takesFocus">,
) {
  return <NotFoundState {...props} takesFocus={titleTakesFocus} />;
}
