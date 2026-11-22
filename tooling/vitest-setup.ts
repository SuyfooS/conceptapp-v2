import { randomBytes } from "node:crypto";

// Every test run gets a hiring-file key of its own (profile H4), set over
// whatever the shell holds, so no test ever reads a real one; `pnpm test:db`
// seals with it against the local database. A key made here is never kept.
process.env.EMPLOYEE_DATA_KEKS = `1:${randomBytes(32).toString("base64")}`;
process.env.EMPLOYEE_DATA_KEK_ACTIVE = "1";
