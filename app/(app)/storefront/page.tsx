import { ModuleScreen, moduleMetadata } from "../module-screen";

export const generateMetadata = () => moduleMetadata("storefront");

export default function StorefrontPage() {
  return <ModuleScreen moduleKey="storefront" />;
}
