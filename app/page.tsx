import { Button } from "@ui/button";
import Link from "next/link";
import { useTranslations } from "next-intl";

const chunks = [
  { n: 1, key: "skeleton", done: true },
  { n: 2, key: "design", done: true },
  { n: 3, key: "database", done: false },
  { n: 4, key: "login", done: false },
] as const;

// Temporary landing for phase 0. Replaced by the public site in phase 5.
export default function Home() {
  const t = useTranslations("home");
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col gap-6 px-4 py-10">
      <header className="flex items-center justify-between">
        <span dir="ltr" className="flex items-center gap-2 text-md font-bold">
          <span aria-hidden className="size-4 rounded-[5px] bg-brand" />
          ConceptApp
        </span>
        <span className="text-sm text-ink-2">{t("version")}</span>
      </header>

      <section className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-ink-2">{t("intro")}</p>
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
              <span className="font-medium">{t(`chunks.${c.key}.title`)}</span>
              <span className="text-sm text-ink-2">
                {t(`chunks.${c.key}.detail`)}
              </span>
            </span>
          </li>
        ))}
      </ol>

      <p className="text-sm text-ink-2">{t("accentNote")}</p>

      <div className="flex flex-col gap-2">
        <Button asChild size="lg" className="w-full">
          <Link href="/design/shell">{t("shellLink")}</Link>
        </Button>
        <Button asChild variant="secondary" size="lg" className="w-full">
          <Link href="/design">{t("designLink")}</Link>
        </Button>
      </div>
    </main>
  );
}
