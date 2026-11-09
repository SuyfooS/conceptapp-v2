import { currentWording } from "../current-wording";
import { ModuleScreen, moduleMetadata } from "../module-screen";

export const generateMetadata = () => moduleMetadata("lists");

// Lists are off everywhere until their screens arrive (L2). A team member who
// switches them on in the console before then reaches this, not "not found".
export default async function ListsPage() {
  return <ModuleScreen moduleKey="lists" wording={await currentWording()} />;
}
