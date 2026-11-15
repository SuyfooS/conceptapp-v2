import { enabledModules } from "@domain/modules";
import { BASE_ROLES, matrixByDefault } from "@domain/role-access";
import { manifests, permissions } from "@modules/registry";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { consoleRolesData } from "../../../../../(admin)/admin/businesses/[slug]/roles/roles-data";
import { demoModuleRows } from "../../../../shell/data";
import { consoleAccess, setups } from "../../../data";
import { ConsoleRolesDemo } from "./demo";

export const generateStaticParams = () =>
  Object.keys(setups).map((slug) => ({ slug }));

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ state?: string; role?: string }>;
};

/** What `?state=open` opens, as the scheduling phase will (the roles plan's R3). */
const OPENED = new Set(["schedule.edit", "schedule.publish"]);

// Roles and permissions as the team sees them in the console (the roles
// plan's R2): today's rules for the demo's people, from the declarations as
// the page reads them before its migration, with pay as "מי רואה שכר" sets
// it, every area closed, and the way back to the business. `?state=open`
// opens scheduling, as R3 will, so its switches change with their undo;
// `?state=readOnly` is a team role that only reads businesses. Stand-in
// actions: nothing reaches a database.
export default function ConsoleRolesTwin({ params, searchParams }: Props) {
  return (
    <Suspense>
      <Demo params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ params, searchParams }: Props) {
  const [{ slug }, { state, role }] = await Promise.all([params, searchParams]);
  const setup = setups[slug];
  if (!setup) notFound();
  const t = await getTranslations("admin.setup.people");
  const pay = consoleAccess(slug, false).roles;
  const byDefault = matrixByDefault(
    permissions,
    BASE_ROLES.filter((base) => pay.includes(base)),
  );
  const matrix =
    state === "open"
      ? {
          ...byDefault,
          keys: byDefault.keys.map((key) =>
            OPENED.has(key.perm) ? { ...key, settable: true } : key,
          ),
        }
      : byDefault;
  // Chat on too, as the console's "מי רואה שכר" twin has its documents.
  const enabled = [
    ...enabledModules(manifests, demoModuleRows),
    "chat" as const,
  ];
  const business = `/design/console/businesses/${slug}`;
  return (
    <ConsoleRolesDemo
      data={consoleRolesData({
        matrix,
        enabled,
        people: setup.business.people.flatMap((person) =>
          person.status === "member"
            ? [{ name: person.name || t("noName"), role: person.role }]
            : [],
        ),
        viewOnly: state === "readOnly",
        documents: true,
      })}
      paths={{
        place: "console",
        business,
        name: setup.business.name,
        access: `${business}/access`,
        team: `${business}#people`,
      }}
      initialRole={role}
    />
  );
}
