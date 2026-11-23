import {
  chatSpaceState,
  documentSpaceState,
  type FileSpace,
  megabytes,
  storageShare,
} from "@domain/storage-use";
import { cn } from "@ui/cn";
import { CoverageBar } from "@ui/coverage-bar";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageSection } from "@ui/page";
import { FileText, Paperclip } from "lucide-react";
import type { ReactNode } from "react";
import { type AppWording, translator } from "../wording";

const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

/**
 * "מקום לקבצים" above chat's settings (bigger teams, the first fixes): how
 * much of the business's space its documents and its chat files take, each
 * with what happens when it runs out, for whoever sees the management page
 * (`public.file_space`). Said in words before it is needed: documents stop
 * when theirs is full and are never deleted for it; chat files' oldest go
 * first. Only the ConceptApp team gives more space, so a space filling says
 * whom to ask. The same one column at every width, above the settings.
 */
export function FileSpaceSummary({
  space,
  wording,
}: {
  space: FileSpace;
  wording: AppWording;
}) {
  const t = translator(wording, "app.manage.fileSpace");
  const documents = documentSpaceState(
    space.documentBytes,
    space.documentSpaceBytes,
  );
  const chat = chatSpaceState(space.chatBytes, space.chatSpaceBytes);
  const usedOf = (used: number, of: number) =>
    t.rich("usedOf", { used: megabytes(used), space: megabytes(of), ltr });
  const rows: {
    key: string;
    icon: ReactNode;
    title: string;
    used: number;
    of: number;
    line: string;
    state: "ok" | "near" | "full";
  }[] = [
    {
      key: "documents",
      icon: <FileText />,
      title: t("documents"),
      used: space.documentBytes,
      of: space.documentSpaceBytes,
      line:
        documents === "full"
          ? t("documentsFull")
          : documents === "near"
            ? t("documentsNear")
            : t("documentsOk"),
      state: documents,
    },
    {
      key: "chat",
      icon: <Paperclip />,
      title: t("chat"),
      used: space.chatBytes,
      of: space.chatSpaceBytes,
      line: chat === "near" ? t("chatNear") : t("chatOk"),
      state: chat,
    },
  ];
  return (
    <PageSection title={t("title")}>
      <ListGroup className="md:max-w-2xl">
        {rows.map((row) => (
          <ListRow
            key={row.key}
            leading={row.icon}
            title={row.title}
            subtitle={
              <span className="flex flex-col gap-1.5 pt-0.5">
                <span>{usedOf(row.used, row.of)}</span>
                <CoverageBar
                  filled={storageShare(row.used, row.of)}
                  total={100}
                />
                <span
                  className={cn(
                    row.state === "full"
                      ? "font-medium text-danger"
                      : row.state === "near"
                        ? "font-medium text-warning"
                        : "text-ink-2",
                  )}
                >
                  {row.line}
                </span>
              </span>
            }
          />
        ))}
      </ListGroup>
      {documents !== "ok" || chat !== "ok" ? (
        <p className="px-1 text-ink-2 md:max-w-2xl">{t("more")}</p>
      ) : null}
    </PageSection>
  );
}
