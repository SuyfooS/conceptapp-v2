import { ModuleScreen, moduleMetadata } from "../module-screen";

export const generateMetadata = () => moduleMetadata("reservations");

export default function ReservationsPage() {
  return <ModuleScreen moduleKey="reservations" />;
}
