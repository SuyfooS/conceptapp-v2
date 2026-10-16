import { ModuleScreen, moduleMetadata } from "../module-screen";

export const generateMetadata = () => moduleMetadata("time_clock");

export default function ClockPage() {
  return <ModuleScreen moduleKey="time_clock" />;
}
