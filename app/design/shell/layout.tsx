import { AppShell, type NavItem } from "@ui/app-shell";
import {
  CalendarDays,
  House,
  Menu,
  Users,
  UtensilsCrossed,
} from "lucide-react";
import type { Metadata } from "next";
import { business, totalOpenSlots, user } from "./data";

export const metadata: Metadata = {
  title: "דמו פריסה",
  robots: { index: false, follow: false },
};

const nav: NavItem[] = [
  { href: "/design/shell", label: "בית", icon: <House />, exact: true },
  {
    href: "/design/shell/schedule",
    label: "סידור",
    icon: <CalendarDays />,
    count: totalOpenSlots,
  },
  {
    href: "/design/shell/reservations",
    label: "הזמנות",
    icon: <UtensilsCrossed />,
  },
  { href: "/design/shell/team", label: "צוות", icon: <Users /> },
  { href: "/design/shell/more", label: "עוד", icon: <Menu /> },
];

// Layout demo with mock data: the same app in phone, tablet and desktop form.
export default function ShellDemoLayout({
  children,
}: LayoutProps<"/design/shell">) {
  return (
    <AppShell businessName={business.name} user={user} nav={nav}>
      {children}
    </AppShell>
  );
}
