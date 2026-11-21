"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * locked: no sound until a tap (none yet, or the device stopped it: a call
 * on an iPad, the tablet asleep). starting: tapped, and the device is
 * starting it (a moment on an iPad), so nothing is asked for yet. on: it
 * plays. off: this browser has none.
 */
export type StationSoundState = "locked" | "starting" | "on" | "off";

/** How long a tap's start may take before the screen asks for a tap again. */
export const SOUND_START_MS = 3000;

/** The sound as the device has it: on while its context runs, else stopped. */
export function soundOf(
  context: { state: AudioContextState } | null,
): "on" | "locked" {
  return context?.state === "running" ? "on" : "locked";
}

/**
 * The sound as a tap leaves it, before the device answers: on at once for a
 * context that runs already (made in that tap, or never stopped), else
 * starting, never stopped, so no banner asks for the tap just given.
 */
export function soundOnTap(context: {
  state: AudioContextState;
}): "on" | "starting" {
  return context.state === "running" ? "on" : "starting";
}

export type StationSound = {
  state: StationSoundState;
  /** The tap a browser needs before a sound: it chimes once to say it works. */
  unlock: () => void;
  /** A new ticket, or a held block called. */
  chime: () => void;
  /** A ticket waiting too long. */
  reminder: () => void;
  /** A line taken back or cancelled on a ticket shown. */
  doubleChime: () => void;
};

/** iOS 17's way to play through the silent switch, where it exists. */
type WithAudioSession = Navigator & { audioSession?: { type: string } };

/** One soft tone: up fast, down slowly, as the kitchen hears it over the hood. */
function tone(
  audio: AudioContext,
  frequency: number,
  after: number,
  length: number,
) {
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  const at = audio.currentTime + after;
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.3, at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start(at);
  oscillator.stop(at + length + 0.05);
}

/**
 * A station's sounds (waiter mode P8a, §4.4), made in the browser with no
 * sound files: one AudioContext, made on the tap that unlocks it, asked to
 * play through an iPad's silent switch where the browser has
 * `navigator.audioSession` (iOS 17 on). Three tones: a chime (880 Hz), a
 * reminder (660 Hz, longer) and a double chime (520 Hz twice). The state
 * follows the context: one the device suspends or interrupts is locked again,
 * and the screen asks for a tap. Shown again after being hidden, it tries to
 * resume on its own first. Closed when the screen goes.
 */
export function useStationSound(): StationSound {
  const audio = useRef<AudioContext | null>(null);
  const [state, setState] = useState<StationSoundState>("locked");
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);

  const follow = useCallback(() => {
    setState(soundOf(audio.current));
  }, []);

  const play = useCallback(
    (notes: readonly (readonly [number, number, number])[]) => {
      const context = audio.current;
      if (context?.state !== "running") return;
      for (const [frequency, after, length] of notes) {
        tone(context, frequency, after, length);
      }
    },
    [],
  );

  const chime = useCallback(() => play([[880, 0, 0.45]]), [play]);
  const reminder = useCallback(() => play([[660, 0, 0.6]]), [play]);
  const doubleChime = useCallback(
    () =>
      play([
        [520, 0, 0.15],
        [520, 0.27, 0.15],
      ]),
    [play],
  );

  const unlock = useCallback(() => {
    const Context =
      typeof window === "undefined" ? undefined : window.AudioContext;
    if (!Context) {
      setState("off");
      return;
    }
    try {
      const session = (navigator as WithAudioSession).audioSession;
      if (session) session.type = "playback";
    } catch {
      // Older iOS refuses it: the silent switch may mute the sound there.
    }
    try {
      if (!audio.current || audio.current.state === "closed") {
        audio.current = new Context();
        audio.current.onstatechange = follow;
      }
      const context = audio.current;
      // Said at once, in the tap: a context made in it runs already, and
      // `onstatechange` never tells of that; one still starting asks for
      // nothing until the device answers.
      setState(soundOnTap(context));
      void context
        .resume()
        .then(() => {
          follow();
          chime();
        })
        .catch(follow);
      // A start the device never answers asks for the tap again.
      if (settle.current) clearTimeout(settle.current);
      settle.current = setTimeout(follow, SOUND_START_MS);
    } catch {
      setState("off");
    }
  }, [follow, chime]);

  useEffect(() => {
    function onVisibilityChange() {
      const context = audio.current;
      if (document.visibilityState !== "visible" || !context) return;
      if (context.state === "running") {
        follow();
        return;
      }
      void context
        .resume()
        .catch(() => undefined)
        .finally(follow);
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [follow]);

  useEffect(
    () => () => {
      if (settle.current) clearTimeout(settle.current);
      void audio.current?.close();
      audio.current = null;
    },
    [],
  );

  return { state, unlock, chime, reminder, doubleChime };
}
