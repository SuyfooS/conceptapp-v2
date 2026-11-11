import type { StorageUse } from "@db/chat-files";
import { FILES_GUARD_BYTES, STORAGE_PLAN_BYTES } from "@domain/chat-files";
import {
  DATABASE_PLAN_BYTES,
  DATABASE_TELL_BYTES,
  STORAGE_TELL_BYTES,
  storageAlerts,
  storageAmount,
  storageShare,
} from "@domain/storage-use";
import { cn } from "@ui/cn";
import { CoverageBar } from "@ui/coverage-bar";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageSection } from "@ui/page";
import { Building, CircleAlert, Database, HardDrive } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { BusinessMark } from "../business-mark";

const BUCKETS = ["avatars", "list-photos", "chat-files", "documents"] as const;
type KnownBucket = (typeof BUCKETS)[number];
const isKnownBucket = (bucket: string): bucket is KnownBucket =>
  (BUCKETS as readonly string[]).includes(bucket);

/**
 * The console's storage card (chat plan §6.6, C4), for the ConceptApp team:
 * how full the free plan is (the database of 500 MB, Storage of 1 GB, which
 * every business shares), Storage by kind, each business's chat files beside
 * its space, and every business's space added up, with a warning before
 * anything is refused: past 900 MB new chat files stop. Sizes and counts
 * only, from `public.admin_storage`: never a file, a conversation or a
 * person. Phone and tablet list the businesses; the desktop has a table.
 * `accents` are the businesses' colours, by id, from the console's list.
 */
export async function StorageCard({
  use,
  accents,
}: {
  use: StorageUse;
  accents: ReadonlyMap<string, string>;
}) {
  const t = await getTranslations("admin.storage");
  const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;
  const unit = (bytes: number) => {
    const amount = storageAmount(bytes);
    return { value: amount.value, unit: t(`units.${amount.unit}`) };
  };
  const amount = (bytes: number) => t.rich("amount", { ...unit(bytes), ltr });
  const usedOf = (used: number, plan: number) => {
    const a = unit(used);
    const b = unit(plan);
    return t.rich("usedOf", {
      used: a.value,
      usedUnit: a.unit,
      plan: b.value,
      planUnit: b.unit,
      ltr,
    });
  };
  const guard = unit(use.guardBytes > 0 ? use.guardBytes : FILES_GUARD_BYTES);
  const alerts = storageAlerts(use);
  const capsBytes = use.chatCapsBytes + use.documentCapsBytes;

  const warnings: { key: string; danger: boolean; text: ReactNode }[] = [];
  if (alerts.filesRefused) {
    warnings.push({
      key: "filesRefused",
      danger: true,
      text: t.rich("alerts.filesRefused", {
        guard: guard.value,
        guardUnit: guard.unit,
        ltr,
      }),
    });
  } else if (alerts.storageHigh) {
    const limit = unit(STORAGE_TELL_BYTES);
    warnings.push({
      key: "storageHigh",
      danger: false,
      text: t.rich("alerts.storageHigh", {
        limit: limit.value,
        limitUnit: limit.unit,
        guard: guard.value,
        guardUnit: guard.unit,
        ltr,
      }),
    });
  }
  if (alerts.capsOver) {
    warnings.push({
      key: "capsOver",
      danger: false,
      text: t.rich("alerts.capsOver", {
        guard: guard.value,
        guardUnit: guard.unit,
        ltr,
      }),
    });
  }
  if (alerts.databaseHigh) {
    const limit = unit(DATABASE_TELL_BYTES);
    const plan = unit(DATABASE_PLAN_BYTES);
    warnings.push({
      key: "databaseHigh",
      danger: false,
      text: t.rich("alerts.databaseHigh", {
        limit: limit.value,
        limitUnit: limit.unit,
        plan: plan.value,
        planUnit: plan.unit,
        ltr,
      }),
    });
  }

  const chat = unit(use.chatCapsBytes);
  const documents = unit(use.documentCapsBytes);
  // The free plan, one row each: what is used of it, its share, and a bar.
  const meters: {
    key: string;
    icon: ReactNode;
    title: string;
    used: number;
    plan: number;
    line?: ReactNode;
  }[] = [
    {
      key: "database",
      icon: <Database />,
      title: t("database"),
      used: use.databaseBytes,
      plan: DATABASE_PLAN_BYTES,
    },
    {
      key: "files",
      icon: <HardDrive />,
      title: t("files"),
      used: use.storageBytes,
      plan: STORAGE_PLAN_BYTES,
    },
    {
      key: "caps",
      icon: <Building />,
      title: t("caps"),
      used: capsBytes,
      plan: STORAGE_PLAN_BYTES,
      line: t.rich("capsLine", {
        chat: chat.value,
        chatUnit: chat.unit,
        documents: documents.value,
        documentsUnit: documents.unit,
        ltr,
      }),
    },
  ];
  const markOf = (business: { id: string; name: string }) => {
    const accent = accents.get(business.id.toLowerCase());
    return accent ? (
      <BusinessMark name={business.name} accent={accent} />
    ) : null;
  };

  return (
    <PageSection title={t("title")} className="flex flex-col gap-4">
      <p className="-mt-1 px-1 text-ink-2 text-sm">{t("subtitle")}</p>
      {warnings.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {warnings.map((warning) => (
            <li
              key={warning.key}
              className={cn(
                "flex items-start gap-2 rounded-card px-4 py-3",
                warning.danger
                  ? "bg-danger-soft text-ink"
                  : "bg-warning-soft text-ink",
              )}
            >
              <CircleAlert
                aria-hidden="true"
                className={cn(
                  "mt-0.5 size-5 shrink-0",
                  warning.danger ? "text-danger" : "text-warning",
                )}
              />
              <span className="min-w-0">{warning.text}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2 md:items-start">
        <PageSection title={t("plan")} level={3}>
          <ListGroup>
            {meters.map((meter) => {
              const share = storageShare(meter.used, meter.plan);
              return (
                <ListRow
                  key={meter.key}
                  leading={meter.icon}
                  title={meter.title}
                  subtitle={
                    <span className="flex flex-col gap-1.5 pt-0.5">
                      <span>{usedOf(meter.used, meter.plan)}</span>
                      <CoverageBar filled={share} total={100} />
                      {meter.line ? <span>{meter.line}</span> : null}
                    </span>
                  }
                  trailing={
                    <span className="font-semibold text-ink">
                      {t.rich("percent", { share, ltr })}
                    </span>
                  }
                />
              );
            })}
          </ListGroup>
        </PageSection>
        <PageSection title={t("byBucket")} level={3}>
          <ListGroup>
            {use.buckets.map((bucket) => (
              <ListRow
                key={bucket.bucket}
                title={t(
                  `buckets.${isKnownBucket(bucket.bucket) ? bucket.bucket : "other"}`,
                )}
                subtitle={t("filesCount", { count: bucket.files })}
                trailing={
                  <span className="text-ink-2">{amount(bucket.bytes)}</span>
                }
              />
            ))}
          </ListGroup>
        </PageSection>
      </div>
      <PageSection title={t("byBusiness")} level={3}>
        {use.businesses.length === 0 ? (
          <p className="px-1 text-ink-2">{t("noBusinesses")}</p>
        ) : (
          <>
            <div className="xl:hidden">
              <ListGroup>
                {use.businesses.map((business) => (
                  <ListRow
                    key={business.id}
                    leading={markOf(business) ?? undefined}
                    title={business.name}
                    subtitle={
                      business.filesOpen
                        ? usedOf(business.chatBytes, business.chatCapBytes)
                        : t("closed")
                    }
                  />
                ))}
              </ListGroup>
            </div>
            <div className="hidden xl:block">
              <BusinessTable use={use} t={t} amount={amount} markOf={markOf} />
            </div>
          </>
        )}
      </PageSection>
    </PageSection>
  );
}

const th = "px-5 pt-4 pb-2.5 text-start font-medium text-ink-2 text-sm";
const td = "px-5 py-3 border-line border-t";

/** Desktop: one row per business, its chat files beside its space. */
function BusinessTable({
  use,
  t,
  amount,
  markOf,
}: {
  use: StorageUse;
  t: Awaited<ReturnType<typeof getTranslations<"admin.storage">>>;
  amount: (bytes: number) => ReactNode;
  markOf: (business: { id: string; name: string }) => ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-card bg-surface shadow-card">
      <table className="w-full border-collapse">
        <caption className="sr-only">{t("businessLabel")}</caption>
        <thead>
          <tr>
            <th scope="col" className={th}>
              {t("business")}
            </th>
            <th scope="col" className={th}>
              {t("chatUsed")}
            </th>
            <th scope="col" className={th}>
              {t("chatCap")}
            </th>
            <td className={cn(th, "w-48")} />
          </tr>
        </thead>
        <tbody>
          {use.businesses.map((business) => (
            <tr key={business.id}>
              <th scope="row" className={cn(td, "text-start font-medium")}>
                <span className="flex items-center gap-3">
                  {markOf(business)}
                  {business.name}
                </span>
              </th>
              <td className={td}>{amount(business.chatBytes)}</td>
              <td className={cn(td, "text-ink-2")}>
                {business.filesOpen
                  ? amount(business.chatCapBytes)
                  : t("closed")}
              </td>
              <td className={td}>
                {business.filesOpen ? (
                  <CoverageBar
                    filled={storageShare(
                      business.chatBytes,
                      business.chatCapBytes,
                    )}
                    total={100}
                  />
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
