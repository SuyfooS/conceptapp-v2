"use client";

import { useEffect } from "react";
import { madeWith, saveSubscription, subscribe, WORKER } from "./push-client";

/**
 * On each visit to the app, quietly: when this browser already has
 * notifications on (permission given, the worker registered, a subscription),
 * tell the app it is still here, for whoever is signed in now, and subscribe
 * again if the app's key has changed. It never asks for anything, never
 * registers the worker itself, and never turns notifications back on where
 * the person turned them off. Renders nothing.
 */
export function PushRegistration({ publicKey }: { publicKey: string }) {
  useEffect(() => {
    if (
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window) ||
      Notification.permission !== "granted"
    ) {
      return;
    }
    (async () => {
      const registration = await navigator.serviceWorker.getRegistration("/");
      if (!registration?.active?.scriptURL.endsWith(WORKER)) return;
      // The browser's own check for a new worker.
      registration.update().catch(() => {});
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) return;
      if (madeWith(subscription, publicKey)) {
        await saveSubscription(subscription);
        return;
      }
      // A new key: the old subscription can't be used any more.
      const old = subscription.endpoint;
      await subscription.unsubscribe();
      await saveSubscription(await subscribe(registration, publicKey), old);
    })().catch(() => {});
  }, [publicKey]);
  return null;
}
