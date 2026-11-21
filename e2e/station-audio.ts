import type { Page } from "@playwright/test";

/**
 * The kitchen's screen's sounds, heard by the test (waiter mode P8a): an
 * init script puts a stand-in AudioContext in the page's place, which runs at
 * once and keeps each tone's frequency, in the order played. Nothing reaches
 * a speaker.
 */
export async function stubAudio(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const played: number[] = [];
    (window as unknown as { __tones: number[] }).__tones = played;
    const param = () => ({
      value: 0,
      setValueAtTime() {},
      exponentialRampToValueAtTime() {},
    });
    class StandInContext {
      state = "suspended";
      currentTime = 0;
      destination = {};
      onstatechange: (() => void) | null = null;
      async resume() {
        this.state = "running";
        this.onstatechange?.();
      }
      async close() {
        this.state = "closed";
      }
      createGain() {
        return { gain: param(), connect: (to: unknown) => to };
      }
      createOscillator() {
        const frequency = param();
        return {
          frequency,
          connect: (to: unknown) => to,
          start() {
            played.push(frequency.value);
          },
          stop() {},
        };
      }
    }
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      value: StandInContext,
    });
  });
}

/** The tones the page played so far, by frequency. */
export async function tones(page: Page): Promise<number[]> {
  return page.evaluate(
    () => (window as unknown as { __tones?: number[] }).__tones ?? [],
  );
}
