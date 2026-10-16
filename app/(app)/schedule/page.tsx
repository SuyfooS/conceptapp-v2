import { ModuleScreen, moduleMetadata } from "../module-screen";

export const generateMetadata = () => moduleMetadata("scheduling");

export default function SchedulePage() {
  return <ModuleScreen moduleKey="scheduling" />;
}
