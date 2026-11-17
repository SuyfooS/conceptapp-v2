import { ModeShell } from "./mode-shell";

// The mode's own menu of the app (§2.5): the same shell, drawing the mode's
// items, for every screen a waiter, a preparer or a manager uses in it.
// The stations and the demo's list of screens sit outside it.
export default function OrderModeLayout({
  children,
}: LayoutProps<"/design/order-taking">) {
  return <ModeShell>{children}</ModeShell>;
}
