import { Button } from "@ui/button";
import Link from "next/link";

const chunks = [
  {
    n: 1,
    title: "שלד הפרויקט",
    detail: "עברית מימין לשמאל עם Next.js, TypeScript ו‑Tailwind",
    done: true,
  },
  {
    n: 2,
    title: "מערכת עיצוב",
    detail: "טוקנים, רכיבי בסיס ודף ‎/design",
    done: true,
  },
  {
    n: 3,
    title: "בסיס נתונים",
    detail: "עסקים וחברויות עם RLS ובדיקות בידוד",
    done: false,
  },
  {
    n: 4,
    title: "כניסה בטלפון",
    detail: "קוד חד‑פעמי ומסך בית בצבע העסק",
    done: false,
  },
];

// Temporary landing for phase 0. Replaced by the public site in phase 5.
export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col gap-6 px-4 py-10">
      <header className="flex items-center justify-between">
        <span dir="ltr" className="flex items-center gap-2 text-md font-bold">
          <span aria-hidden className="size-4 rounded-[5px] bg-brand" />
          ConceptApp
        </span>
        <span className="text-sm text-ink-2">גרסה 2 · שלב 0</span>
      </header>

      <section className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">שלב 0 בדרך</h1>
        <p className="text-ink-2">
          שתי החתיכות הראשונות של שלב 0 במקומן: השלד ומערכת העיצוב. השתיים הבאות
          מחברות את בסיס הנתונים ואת הכניסה עם הטלפון.
        </p>
      </section>

      <ol className="flex flex-col overflow-hidden rounded-card border border-line bg-surface">
        {chunks.map((c) => (
          <li
            key={c.n}
            className="flex items-start gap-3 border-line border-b px-4 py-3 last:border-b-0"
          >
            <span
              className={
                c.done
                  ? "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-ink"
                  : "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-sm font-bold text-ink-2"
              }
            >
              {c.n}
            </span>
            <span className="flex flex-col">
              <span className="font-medium">{c.title}</span>
              <span className="text-sm text-ink-2">{c.detail}</span>
            </span>
          </li>
        ))}
      </ol>

      <p className="text-sm text-ink-2">
        העיגולים הצבועים הם בצבע העסק (ברירת המחדל: בורדו). כל עסק בוחר צבע אחד,
        וכל השאר קבוע.
      </p>

      <Button asChild size="lg" className="w-full">
        <Link href="/design">למערכת העיצוב</Link>
      </Button>
    </main>
  );
}
