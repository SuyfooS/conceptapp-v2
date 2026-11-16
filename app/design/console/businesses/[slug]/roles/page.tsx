import { enabledModules } from "@domain/modules";
import { BASE_ROLES, matrixByDefault } from "@domain/role-access";
import { manifests, permissions } from "@modules/registry";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { consoleRolesData } from "../../../../../(admin)/admin/businesses/[slug]/roles/roles-data";
import { demoModuleRows } from "../../../../shell/data";
import { demoShiftLead } from "../../../../shell/manage/roles/data";
import { consoleAccess, setups } from "../../../data";
import { ConsoleRolesDemo } from "./demo";

export const generateStaticParams = () =>
  Object.keys(setups).map((slug) => ({ slug }));

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ state?: string; role?: string }>;
};

// Roles and permissions as the team sees them in the console (the roles
// plan's R2): today's rules for the demo's people, from the declarations,
// with pay as "מי רואה שכר" sets it, the areas open for changes as the
// database says once their phase has opened them (`settable` in the
// declarations: scheduling since R3, the time clock since R4, lists since
// R5, the team since R6, the management page since R7 and chat since R8,
// the team and the management page with edit, view and none) and every
// other area closed, and the way back to the business. The shell twin's
// "אחראי משמרת" follows managers and workers, a role the business named
// (R11a) and held by nobody yet, as every one is until R11b gives them, with
// "הוספת תפקיד", its rename and its removal. `?state=open` opens every area,
// as the screen will be once each phase has opened its own, so every switch
// changes with its undo; `?state=readOnly` is a team role that only reads
// businesses. Stand-in actions: nothing reaches a database.
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
  // As the database answers once each phase is in: the keys declared
  // settable (`matrixByDefault` opens none, as before a migration), or with
  // `?state=open` every key but the one an owner gives, which keeps its
  // switch.
  const declared = new Set<string>(
    permissions.filter((entry) => entry.settable).map((entry) => entry.key),
  );
  const matrix = {
    ...byDefault,
    keys: byDefault.keys.map((key) =>
      (state === "open" ? !key.byOwner : declared.has(key.perm))
        ? { ...key, settable: true }
        : key,
    ),
  };
  // Chat on too, as the console's "מי רואה שכר" twin has its documents.
  const enabled = [
    ...enabledModules(manifests, demoModuleRows),
    "chat" as const,
  ];
  const business = `/design/console/businesses/${slug}`;
  const data = consoleRolesData({
    matrix,
    enabled,
    people: setup.business.people.flatMap((person) =>
      person.status === "member"
        ? [{ name: person.name || t("noName"), role: person.role }]
        : [],
    ),
    viewOnly: state === "readOnly",
    documents: true,
  });
  return (
    <ConsoleRolesDemo
      data={{
        ...data,
        roles: [...data.roles, { ...demoShiftLead, people: [], invited: 0 }],
      }}
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
