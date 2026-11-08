import { currentWording } from "../current-wording";
import { ModuleScreen, moduleMetadata } from "../module-screen";

export const generateMetadata = () => moduleMetadata("reservations");

export default async function ReservationsPage() {
  return (
    <ModuleScreen moduleKey="reservations" wording={await currentWording()} />
  );
}
