"use client";

import {
  type DeviceLabel,
  deviceLabel,
  installedHere,
  isPhone,
  type PushAskFacts,
  type PushAskState,
  pushAskStart,
  pushSupport,
} from "@domain/push";
import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from "react";
import { browserFacts, installPutAway, ourWorker } from "./push-client";

/** Where an offer's card stands: the browser still asked, nothing to offer, or a state. */
export type PushAskShown = "checking" | "none" | PushAskState;

/**
 * Where an offer's card starts on this browser (`pushAskStart`): it asks the
 * browser what it is, whether it blocks notifications, whether the steps to
 * the home screen were put away here, whether `devices` (the person's, from
 * the server) already has this iPhone's app, and, where push is ready,
 * whether the app's worker from before has a subscription. It registers
 * nothing and asks for no permission. Whether to say phone or device comes
 * from what the browser is, never from the width. The worker found, for the
 * press that turns notifications on.
 */
export function usePushAskState(devices: readonly DeviceLabel[]): {
  state: PushAskShown;
  setState: Dispatch<SetStateAction<PushAskShown>>;
  device: "phone" | "other";
  worker: RefObject<ServiceWorkerRegistration | null>;
} {
  const [state, setState] = useState<PushAskShown>("checking");
  const [device, setDevice] = useState<"phone" | "other">("other");
  const worker = useRef<ServiceWorkerRegistration | null>(null);
  // Asked once, as the card first draws: the server's next drawing changes
  // nothing here.
  const known = useRef(devices);

  useEffect(() => {
    let live = true;
    const facts = browserFacts();
    setDevice(isPhone(facts) ? "phone" : "other");
    const support = pushSupport(facts);
    const asked: PushAskFacts = {
      support,
      permission: support === "ready" ? Notification.permission : "default",
      subscribed: false,
      installPutAway: support === "installFirst" && installPutAway(),
      installedHere: installedHere(deviceLabel(facts.userAgent), known.current),
    };
    const first = pushAskStart(asked);
    if (support !== "ready" || first === "none") {
      setState(first);
      return;
    }
    (async () => {
      try {
        // Only a worker turned on here before: none is registered for asking.
        const registration = await ourWorker();
        const subscription = registration
          ? await registration.pushManager.getSubscription()
          : null;
        if (!live) return;
        worker.current = registration;
        setState(pushAskStart({ ...asked, subscribed: subscription !== null }));
      } catch {
        if (live) setState("none");
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  return { state, setState, device, worker };
}
