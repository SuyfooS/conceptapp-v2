/**
 * The soft wash of the accent behind the top of a screen, as a background, so
 * it needs no stacking context of its own: anything floating inside the page
 * still rises above the shell's fades. For a whole-page element.
 */
export const glowClass =
  "bg-[radial-gradient(70%_90%_at_80%_0%,color-mix(in_oklab,var(--accent)_16%,transparent),transparent_70%)] bg-size-[100%_420px] bg-no-repeat";

/**
 * The same for a screen inside AppShell. Off on desktop, where the page is
 * narrower than the window and the sidebar would cut the wash in a hard line.
 */
export const pageGlowClass = `${glowClass} bg-size-[100%_340px] xl:bg-none`;
