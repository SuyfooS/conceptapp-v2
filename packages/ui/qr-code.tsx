import { qrMatrix, qrPath } from "@domain/qr";
import { cn } from "./cn";

/**
 * A QR code, dark on white in every appearance (`qr-ink` on `qr-paper`), as
 * cameras read it best. One path, so it stays crisp at any size; its side is
 * the code's with the quiet zone, so nothing else needs a margin around it. A
 * new value fades in. No hooks: it draws on the server and in the browser.
 */
export function QrCode({
  value,
  label,
  className,
}: {
  /** The text the code holds. */
  value: string;
  /** What it is, for screen readers. */
  label: string;
  className?: string;
}) {
  const { size, d } = qrPath(qrMatrix(value));
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
      className={cn("block aspect-square w-full", className)}
    >
      <rect width={size} height={size} className="fill-qr-paper" />
      <path
        key={value}
        d={d}
        className="animate-[fade-in_180ms] fill-qr-ink motion-reduce:animate-none"
      />
    </svg>
  );
}
