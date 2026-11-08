"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
  type MouseEvent,
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
} from "react";
import { cn } from "./cn";

/** Between the slots, and in the caret's sums: the row's `gap-2`. */
const GAP_PX = 8;
/** Between one slot and the next when several fill or empty together. */
const CASCADE_MS = 20;
const SINK_DELAY_MS = 60;
const SINK_STEP_MS = 30;

export type CodeSlotsStatus = "idle" | "pending" | "error" | "success";

const digitsOf = (raw: string) => raw.replace(/\D/g, "");
const blank = (length: number) => Array.from({ length }, () => "");
const firstEmptyOf = (slots: string[]) => {
  const i = slots.indexOf("");
  return i === -1 ? slots.length - 1 : i;
};

export type CodeSlotsProps = {
  /** The field's name: the code is posted with its form under it. */
  name: string;
  label: string;
  length?: number;
  /**
   * pending: being checked, so typing waits. error: the digits drain away in the
   * danger colour, ready to try again. success: a sweep of the accent and a check.
   */
  status?: CodeSlotsStatus;
  /** Called once the last digit is in, also when they arrive together. */
  onComplete?: (code: string) => void;
  autoFocus?: boolean;
  /**
   * one-time-code lets the phone offer a code from a text message, as signing
   * in wants. off for digits read off another screen, such as the clock's.
   */
  autoComplete?: "one-time-code" | "off";
  /** For the surface the slots sit on. */
  slotClassName?: string;
  className?: string;
};

/**
 * Boxes for a one-time code. One real input lies over them, so the keyboard's
 * code suggestion and paste both work. Digits read left to right on a right to
 * left page.
 *
 * After Code Slots from React Bits (see packages/ui/README.md), rebuilt on CSS
 * transitions and our tokens.
 */
export function CodeSlots({
  name,
  label,
  length = 6,
  status = "idle",
  onComplete,
  autoFocus = false,
  autoComplete = "one-time-code",
  slotClassName,
  className,
}: CodeSlotsProps) {
  const t = useTranslations("ui.codeSlots");
  const countId = useId();
  const input = useRef<HTMLInputElement>(null);
  const row = useRef<HTMLDivElement>(null);
  const [slots, setSlots] = useState(() => blank(length));
  const [active, setActive] = useState(0);
  const [focused, setFocused] = useState(false);
  const [failed, setFailed] = useState(false);
  /** Who moves first when several slots change: a fill's start, or the drain. */
  const [flow, setFlow] = useState<number | "drain" | null>(null);

  const code = slots.join("");
  const success = status === "success";
  const busy = status === "pending" || success;

  function insert(raw: string, from = active) {
    const digits = digitsOf(raw);
    if (!digits) return;
    const next = [...slots];
    let i = from;
    for (const digit of digits) {
      if (i >= length) break;
      next[i] = digit;
      i += 1;
    }
    if (i === from) return;
    setFailed(false);
    setFlow(from);
    setSlots(next);
    setActive(Math.min(i, length - 1));
  }

  function clear(i: number, stepBack = false) {
    if (slots[i]) {
      const next = [...slots];
      next[i] = "";
      setFlow(null);
      setSlots(next);
    }
    if (stepBack) setActive(i);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (busy || event.metaKey || event.ctrlKey || event.altKey) return;
    const { key } = event;
    if (/^[0-9]$/.test(key)) {
      event.preventDefault();
      insert(key);
    } else if (key === "Backspace") {
      event.preventDefault();
      if (slots[active]) clear(active);
      else if (active > 0) clear(active - 1, true);
    } else if (key === "Delete") {
      event.preventDefault();
      clear(active);
    } else if (key === "ArrowLeft") {
      event.preventDefault();
      setActive(Math.max(active - 1, 0));
    } else if (key === "ArrowRight") {
      event.preventDefault();
      setActive(Math.min(active + 1, length - 1));
    } else if (key === "Home") {
      event.preventDefault();
      setActive(0);
    } else if (key === "End") {
      event.preventDefault();
      setActive(length - 1);
    }
  }

  function onPaste(event: ClipboardEvent<HTMLInputElement>) {
    if (busy) return;
    event.preventDefault();
    insert(event.clipboardData.getData("text"), 0);
  }

  /** What a phone's keyboard and its code suggestion send. */
  function onChange(event: ChangeEvent<HTMLInputElement>) {
    if (busy) return;
    const digits = digitsOf(event.target.value);
    if (digits) insert(digits, digits.length === 1 ? active : 0);
  }

  /** A press on a slot goes there, but never past the first empty one. */
  function onMouseDown(event: MouseEvent<HTMLDivElement>) {
    event.preventDefault();
    const rect = row.current?.getBoundingClientRect();
    if (rect && !busy) {
      const at = Math.floor(
        ((event.clientX - rect.left) / (rect.width + GAP_PX)) * length,
      );
      setActive(Math.max(0, Math.min(at, firstEmptyOf(slots))));
    }
    input.current?.focus();
  }

  // Each refusal drains what was typed, and the caret goes back to the start.
  useEffect(() => {
    if (status !== "error") return;
    setFailed(true);
    setFlow("drain");
    setSlots(blank(length));
    setActive(0);
    input.current?.focus();
  }, [status, length]);

  const complete = useEffectEvent((value: string) => onComplete?.(value));
  const wasFull = useRef(false);
  // After the render, so the hidden field already holds the code for a submit.
  useEffect(() => {
    const full = code.length === length;
    if (full && !wasFull.current) complete(code);
    wasFull.current = full;
  }, [code, length]);

  const delayOf = (i: number) => {
    if (flow === "drain") return (length - 1 - i) * CASCADE_MS;
    return flow === null ? 0 : Math.max(0, i - flow) * CASCADE_MS;
  };
  const slotWidth = `calc((100% - ${(length - 1) * GAP_PX}px) / ${length})`;
  const showCaret = focused && !busy && !slots[active];

  return (
    <div className={cn("flex flex-col", className)}>
      <input type="hidden" name={name} value={code} />
      {/* biome-ignore lint/a11y/noStaticElementInteractions: this only sends focus to the input inside it */}
      <div
        ref={row}
        dir="ltr"
        data-status={failed ? "error" : status}
        onMouseDown={onMouseDown}
        className="relative isolate flex w-full cursor-text touch-manipulation gap-2"
      >
        <input
          ref={input}
          type="text"
          inputMode="numeric"
          autoComplete={autoComplete}
          pattern="[0-9]*"
          value=""
          aria-label={label}
          aria-invalid={failed || undefined}
          aria-busy={status === "pending" || undefined}
          aria-describedby={countId}
          readOnly={success}
          // biome-ignore lint/a11y/noAutofocus: the code is the only thing on this step
          autoFocus={autoFocus}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onChange={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="absolute inset-0 z-40 m-0 w-full cursor-text appearance-none bg-transparent p-0 text-[16px] text-transparent caret-transparent opacity-0 outline-none"
        />
        {slots.map((digit, i) => (
          <Slot
            // biome-ignore lint/suspicious/noArrayIndexKey: a slot is its position
            key={i}
            digit={digit}
            active={focused && !busy && i === active}
            failed={failed}
            success={success}
            delay={delayOf(i)}
            sinkDelay={SINK_DELAY_MS + i * SINK_STEP_MS}
            className={slotClassName}
          />
        ))}
        <span
          aria-hidden="true"
          style={{
            clipPath: `inset(0 ${success ? 0 : 50}% round var(--radius-control))`,
          }}
          className={cn(
            "pointer-events-none absolute inset-0 z-10 grid place-items-center bg-accent text-accent-ink ease-calm",
            success
              ? "transition-[clip-path] duration-300"
              : "invisible transition-[clip-path,visibility] duration-200",
          )}
        >
          <Check
            style={{ transitionDelay: success ? "280ms" : "0ms" }}
            className={cn(
              "size-7 stroke-[2.2] transition-[opacity,translate,scale] duration-300 ease-spring",
              success
                ? "translate-y-0 scale-100 opacity-100"
                : "translate-y-2 scale-85 opacity-0",
            )}
          />
        </span>
        <span
          aria-hidden="true"
          style={{
            width: slotWidth,
            transform: `translateX(calc(${active} * (100% + ${GAP_PX}px)))`,
          }}
          className={cn(
            "pointer-events-none absolute inset-y-0 start-0 z-30 grid place-items-center transition-transform duration-200 ease-spring",
            !showCaret && "opacity-0",
          )}
        >
          <span
            key={active}
            className="block h-1/2 w-[1.5px] animate-[caret-blink_1s_linear_infinite] bg-ink"
          />
        </span>
      </div>
      <span id={countId} className="sr-only" aria-live="polite">
        {success
          ? t("accepted")
          : t("count", { filled: code.length, total: length })}
      </span>
    </div>
  );
}

function Slot({
  digit,
  active,
  failed,
  success,
  delay,
  sinkDelay,
  className,
}: {
  digit: string;
  active: boolean;
  failed: boolean;
  success: boolean;
  delay: number;
  sinkDelay: number;
  className?: string;
}) {
  // The digit stays while its slot empties, so it leaves with the fill.
  const [shown, setShown] = useState(digit);
  if (digit && digit !== shown) setShown(digit);

  return (
    <span
      aria-hidden="true"
      data-filled={digit ? "" : undefined}
      className={cn(
        "relative h-[52px] min-w-0 flex-1 select-none overflow-hidden rounded-control bg-surface shadow-card transition-colors duration-200",
        active && "outline-2 outline-accent -outline-offset-2",
        failed && "bg-danger-soft",
        className,
        failed && "bg-danger-soft",
      )}
    >
      <span
        style={{ transitionDelay: `${delay}ms` }}
        className={cn(
          "absolute inset-0 rounded-[inherit] transition-[scale] duration-300 ease-spring",
          failed ? "bg-danger" : "bg-accent",
          digit ? "scale-100" : "scale-0",
        )}
      />
      {shown ? (
        <span
          style={{ transitionDelay: `${success ? sinkDelay : delay}ms` }}
          className={cn(
            "absolute inset-0 z-20 grid place-items-center font-semibold text-xl tabular-nums transition-[translate,opacity] duration-300 ease-spring",
            failed ? "text-danger-ink" : "text-accent-ink",
            success
              ? "translate-y-[26px] opacity-0"
              : digit
                ? "translate-y-0 opacity-100"
                : "translate-y-2 opacity-0",
          )}
        >
          {shown}
        </span>
      ) : null}
    </span>
  );
}
