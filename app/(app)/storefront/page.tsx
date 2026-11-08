import { currentWording } from "../current-wording";
import { ModuleScreen, moduleMetadata } from "../module-screen";

export const generateMetadata = () => moduleMetadata("storefront");

export default async function StorefrontPage() {
  return (
    <ModuleScreen moduleKey="storefront" wording={await currentWording()} />
  );
}
