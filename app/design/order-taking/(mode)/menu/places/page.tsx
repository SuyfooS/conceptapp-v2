import { DemoScreen } from "../../../demo-store";
import { PlacesTwin } from "./places-twin";

// The demo restaurant's tables; `?state=noPlaces` a business with none yet.
export default function OrderMenuPlacesPage() {
  return (
    <DemoScreen>
      <PlacesTwin />
    </DemoScreen>
  );
}
