"use client";

import { ACCENT_PRESETS, accentTokens, BRAND } from "@domain/color";
import { ISRAEL_TIME_ZONE } from "@domain/shabbat";
import { accentProps } from "@ui/accent";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { KitchenStation } from "../../../(station)/station/orders/kitchen-station";
import { TillStation } from "../../../(station)/station/orders/till-station";
import { StoppedStation } from "../../../(station)/station/station-states";
import { orderDemoBusiness, orderDemoDepartments } from "../data";
import { useOpenedWith } from "../demo-store";
import { StationFoot } from "../parts";
import { type StationTwinState, useTwinStationBackend } from "./station-twin";

const SIGN_IN = "/design/screens/sign-in";

/** The demo's colour, the app's default. */
const accent = accentProps(accentTokens(ACCENT_PRESETS[0]?.hex ?? BRAND));

const kitchen = orderDemoDepartments.find((d) => d.key === "kitchen") ?? null;

/** The states that change what the backend does, beyond the evening's rows. */
const twinState = (opened: string | null): StationTwinState =>
  opened === "offline" ||
  opened === "arrives" ||
  opened === "late" ||
  opened === "struck"
    ? opened
    : null;

/**
 * The kitchen's tablet on the twin (waiter mode P8a): the real screen, over
 * the demo's store. It opens on "פתיחת המטבח"; `?state=open` as if pressed;
 * `offline` with no connection; `nothingOpen` with every ticket out;
 * `soundLocked` with the sound stopped; `arrives`, `late` and `struck` with
 * a ticket arriving, waiting too long or struck a few seconds on; `soldOut`
 * with "מה נגמר" open; `allDepartments` the screen of every department;
 * `stopped` once stopped from the prep screen.
 */
export function KitchenStationTwin() {
  // Read once, as the screen is first drawn: the state then comes off the
  // address, and the screen stays as it opened.
  const [opened] = useState(useOpenedWith());
  const t = useTranslations("app.orders.stations.lock");
  const every = opened === "allDepartments";
  const department =
    every || !kitchen ? null : { id: kitchen.key, name: kitchen.name };
  const backend = useTwinStationBackend(
    "prep",
    department?.id ?? null,
    twinState(opened),
  );
  if (opened === "stopped") {
    return <StoppedStation signInHref={SIGN_IN} shows="prep" />;
  }
  // Past the gate as if pressed: the sound on, as the press leaves it, but
  // in `soundLocked`, where it stays the device's, stopped until a tap.
  const past = opened !== null && opened !== "service";
  return (
    <div {...accent}>
      <KitchenStation
        facts={{
          businessName: orderDemoBusiness,
          timeZone: ISRAEL_TIME_ZONE,
          name: department?.name ?? t("defaultAll"),
          department,
        }}
        backend={backend}
        foot={<StationFoot />}
        leave={() => undefined}
        opened={past}
        soundOn={past && opened !== "soundLocked"}
        soldOutOpen={opened === "soldOut"}
      />
    </div>
  );
}

/**
 * The counter's tablet on the twin, locked as the till: the real screen over
 * the demo's store. `?state=chosen` opens table 9, `held` table 4 with its
 * mains waiting, `closed` table 3, closed today; `offline` with no
 * connection.
 */
export function TillStationTwin() {
  // Read once, as the screen is first drawn: the state then comes off the
  // address, and the screen stays as it opened.
  const [opened] = useState(useOpenedWith());
  const t = useTranslations("app.orders.stations.lock");
  const backend = useTwinStationBackend("till", null, twinState(opened));
  const chosen =
    opened === "chosen"
      ? "order-9"
      : opened === "held"
        ? "order-4"
        : opened === "closed"
          ? "order-3"
          : null;
  return (
    <div {...accent}>
      <TillStation
        facts={{
          businessName: orderDemoBusiness,
          timeZone: ISRAEL_TIME_ZONE,
          name: t("defaultTill"),
        }}
        backend={backend}
        foot={<StationFoot />}
        leave={() => undefined}
        chosen={chosen}
      />
    </div>
  );
}
