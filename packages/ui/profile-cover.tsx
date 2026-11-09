import { type CoverPreset, DEFAULT_COVER } from "@domain/profile";
import { type CSSProperties, type ReactNode, useId } from "react";
import { cn } from "./cn";

export type { CoverPreset };

export type ProfileCoverProps = {
  preset?: CoverPreset;
  /** The person's avatar hue (`avatarHue`), for the touch of their own colour in "bloom". */
  hue?: number;
  className?: string;
  children?: ReactNode;
};

/** Each cover's ground, from the business's colour (app/globals.css). */
const GROUND: Record<CoverPreset, string> = {
  glow: "hero-surface",
  waves: "cover-base",
  arcs: "cover-base",
  dots: "cover-base",
  stripes: "cover-stripes",
  horizon: "cover-base",
  mosaic: "cover-base",
  bloom: "cover-bloom",
};

/**
 * The band at the top of a profile, drawn in the reader's business colour:
 * eight presets, each the colour with white or black at low opacity over it,
 * so any accent works in light and dark. A little grain over all of them, so
 * it reads as a surface; it is the screen's one strong moment (its hero). The
 * art is decoration; `children`, such as a way back, sit on it. The caller
 * gives it its size and corners. A span drawn as a block, so it also fits
 * inside a label or a row's trailing slot.
 */
export function ProfileCover({
  preset = DEFAULT_COVER,
  hue,
  className,
  children,
}: ProfileCoverProps) {
  return (
    <span
      data-cover={preset}
      className={cn(
        "relative isolate block overflow-hidden",
        GROUND[preset],
        className,
      )}
      style={
        hue === undefined
          ? undefined
          : ({ "--cover-person": `oklch(0.72 0.1 ${hue})` } as CSSProperties)
      }
    >
      <CoverArt preset={preset} />
      <span
        aria-hidden="true"
        className="cover-grain pointer-events-none absolute inset-0 -z-10"
      />
      {children}
    </span>
  );
}

const ART = "pointer-events-none absolute inset-0 -z-10 size-full";

/** The drawn part of a cover, over its ground; none for the plain ones. */
function CoverArt({ preset }: { preset: CoverPreset }) {
  const id = useId().replace(/[^\w-]/g, "");
  const svg = (children: ReactNode) => (
    <svg
      aria-hidden="true"
      viewBox="0 0 390 200"
      preserveAspectRatio="xMidYMid slice"
      className={ART}
    >
      {children}
    </svg>
  );
  switch (preset) {
    case "waves":
      return svg(
        <>
          <path
            d="M0 92C64 70 120 118 198 100S332 66 390 86V200H0Z"
            fill="white"
            fillOpacity={0.1}
          />
          <path
            d="M0 126C72 104 142 148 216 130S340 102 390 118V200H0Z"
            fill="white"
            fillOpacity={0.14}
          />
          <path
            d="M0 160C82 140 154 178 234 160S354 144 390 152V200H0Z"
            fill="black"
            fillOpacity={0.12}
          />
        </>,
      );
    case "arcs":
      return svg(
        ARCS.map((arc) => (
          <circle
            key={arc.r}
            cx={64}
            cy={-24}
            r={arc.r}
            fill="none"
            stroke="white"
            strokeOpacity={arc.opacity}
            strokeWidth={13}
          />
        )),
      );
    case "dots":
      return svg(
        <>
          <defs>
            <pattern
              id={`${id}-dots`}
              width={14}
              height={14}
              patternUnits="userSpaceOnUse"
            >
              <circle cx={7} cy={7} r={1.8} fill="white" />
            </pattern>
            <radialGradient id={`${id}-fade`} cx={0.3} cy={0.22} r={0.85}>
              <stop offset={0} stopColor="white" stopOpacity={0.8} />
              <stop offset={0.65} stopColor="white" stopOpacity={0.12} />
              <stop offset={1} stopColor="white" stopOpacity={0} />
            </radialGradient>
            <mask id={`${id}-mask`}>
              <rect width={390} height={200} fill={`url(#${id}-fade)`} />
            </mask>
          </defs>
          <rect
            width={390}
            height={200}
            fill={`url(#${id}-dots)`}
            mask={`url(#${id}-mask)`}
          />
        </>,
      );
    case "horizon":
      return svg(
        <>
          <circle cx={290} cy={136} r={104} fill="white" fillOpacity={0.07} />
          <circle cx={290} cy={136} r={62} fill="white" fillOpacity={0.24} />
          <rect
            y={136}
            width={390}
            height={64}
            fill="black"
            fillOpacity={0.17}
          />
          {HORIZON_LINES.map((line) => (
            <rect
              key={line.y}
              y={line.y}
              width={390}
              height={line.height}
              fill="white"
              fillOpacity={0.1}
            />
          ))}
        </>,
      );
    case "mosaic":
      return svg(
        MOSAIC.map((tile) => (
          <rect
            key={`${tile.x}-${tile.y}`}
            x={tile.x}
            y={tile.y}
            width={28}
            height={28}
            rx={8}
            fill={tile.dark ? "black" : "white"}
            fillOpacity={tile.opacity}
          />
        )),
      );
    default:
      // glow, stripes and bloom are their ground alone.
      return null;
  }
}

/** Rings around a point above the start corner, fading outwards. */
const ARCS = Array.from({ length: 12 }, (_, i) => ({
  r: 40 + i * 36,
  opacity: Number(Math.max(0.03, 0.2 - i * 0.016).toFixed(3)),
}));

/** The sun's reflection: lines under the horizon, thicker towards the foot. */
const HORIZON_LINES = Array.from({ length: 7 }, (_, i) => ({
  y: 144 + i * 9,
  height: Number((1.4 + i * 0.6).toFixed(1)),
}));

/** The same tiles on every render: a fixed seed, fading towards the end. */
const MOSAIC = (() => {
  let seed = 11;
  const next = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const tiles: { x: number; y: number; dark: boolean; opacity: number }[] = [];
  for (let y = 6; y < 200; y += 34) {
    for (let x = 6; x < 390; x += 34) {
      const v = next();
      const fade = 0.35 + 0.65 * (1 - x / 390);
      tiles.push(
        v < 0.16
          ? { x, y, dark: true, opacity: 0.1 }
          : {
              x,
              y,
              dark: false,
              opacity: Number(((0.04 + v * 0.17) * fade).toFixed(3)),
            },
      );
    }
  }
  return tiles;
})();
