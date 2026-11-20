import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

// .github/scripts/supabase-start.sh starts the local stack in CI and gets it
// past a host port that is taken (#201). It was checked by hand against stubs
// when it merged; these tests keep that check. The script runs in a copy of
// the repo's layout (its own path, the real supabase/config.toml), with pnpm,
// sudo, sysctl, ss, docker, pgrep and sleep replaced by stubs that record
// their calls, so nothing here touches Docker or the kernel.
//
// CI only, like the script itself: it needs bash and the GNU tools of the
// Ubuntu runner, where `pnpm check` runs these. On Windows there is no such
// shell, so they don't run there (Orel's PowerShell).

const root = join(import.meta.dirname, "..");
const CONFIG_PORTS = [54320, 54321, 54322, 54323, 54324, 54327, 54329];

// Each stub writes one line per call to calls.log. `pnpm exec supabase <args>`
// other than `stop` takes the next line of starts.txt: "ok" starts, anything
// else is printed as the CLI's output (a written \n as a line break) and
// fails. `ss -Htan sport = :<port>` reports a socket on the port while
// busy-<port> holds a count above zero, one fewer each time.
const STUBS: Record<string, string> = {
  pnpm: `
echo "pnpm $*" >> "$STUBS/calls.log"
[ "$1 $2" = "exec supabase" ] || exit 0
shift 2
[ "$1" = stop ] && exit 0
line=$(head -n 1 "$STUBS/starts.txt")
tail -n +2 "$STUBS/starts.txt" > "$STUBS/starts.next" && mv "$STUBS/starts.next" "$STUBS/starts.txt"
[ "$line" = ok ] && { echo "Started supabase local development setup."; exit 0; }
printf '%b\\n' "$line"
exit 1
`,
  sudo: `
echo "sudo $*" >> "$STUBS/calls.log"
exec "$@"
`,
  sysctl: `
echo "sysctl $*" >> "$STUBS/calls.log"
case "$*" in
  "-n net.ipv4.ip_local_port_range") printf '32768\\t60999\\n' ;;
  "-n net.ipv4.ip_local_reserved_ports") cat "$STUBS/reserved.txt" ;;
  "-q -w net.ipv4.ip_local_reserved_ports="*) printf '%s\\n' "\${3#*=}" > "$STUBS/reserved.txt" ;;
  *) exit 1 ;;
esac
`,
  ss: `
echo "ss $*" >> "$STUBS/calls.log"
if [ "$1" = -Htan ]; then
  port=\${4#:}
  count=$(cat "$STUBS/busy-$port" 2> /dev/null || echo 0)
  if [ "$count" -gt 0 ]; then
    echo $((count - 1)) > "$STUBS/busy-$port"
    echo "TIME-WAIT 0 0 10.1.0.4:$port 140.82.112.3:443"
  fi
fi
exit 0
`,
  docker: `
echo "docker $*" >> "$STUBS/calls.log"
exit 0
`,
  pgrep: `
echo "pgrep $*" >> "$STUBS/calls.log"
exit 1
`,
  sleep: `
echo "sleep $*" >> "$STUBS/calls.log"
exit 0
`,
};

type Run = {
  status: number | null;
  output: string;
  calls: string[];
  reserved: string;
};

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

function run(
  args: string[],
  {
    starts = [],
    reserved = "",
    busy = {},
  }: {
    starts?: string[];
    reserved?: string;
    busy?: Record<number, number>;
  } = {},
): Run {
  const dir = mkdtempSync(join(tmpdir(), "supabase-start-"));
  dirs.push(dir);
  const repo = join(dir, "repo");
  const stubs = join(dir, "stubs");
  mkdirSync(join(repo, ".github", "scripts"), { recursive: true });
  mkdirSync(join(repo, "supabase"));
  mkdirSync(stubs);
  copyFileSync(
    join(root, ".github", "scripts", "supabase-start.sh"),
    join(repo, ".github", "scripts", "supabase-start.sh"),
  );
  copyFileSync(
    join(root, "supabase", "config.toml"),
    join(repo, "supabase", "config.toml"),
  );
  for (const [name, body] of Object.entries(STUBS)) {
    const file = join(stubs, name);
    writeFileSync(file, `#!/usr/bin/env bash\n${body.trimStart()}`);
    chmodSync(file, 0o755);
  }
  writeFileSync(
    join(stubs, "starts.txt"),
    starts.map((line) => `${line}\n`).join(""),
  );
  writeFileSync(join(stubs, "reserved.txt"), `${reserved}\n`);
  writeFileSync(join(stubs, "calls.log"), "");
  for (const [port, count] of Object.entries(busy)) {
    writeFileSync(join(stubs, `busy-${port}`), `${count}\n`);
  }
  const result = spawnSync(
    "bash",
    [join(repo, ".github", "scripts", "supabase-start.sh"), ...args],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${stubs}:${process.env.PATH ?? "/usr/bin:/bin"}`,
        STUBS: stubs,
        RUNNER_TEMP: dir,
      },
      timeout: 20_000,
    },
  );
  const read = (name: string) =>
    existsSync(join(stubs, name))
      ? readFileSync(join(stubs, name), "utf8")
      : "";
  return {
    status: result.status,
    output: `${result.stdout}${result.stderr}`,
    calls: read("calls.log").split("\n").filter(Boolean),
    reserved: read("reserved.txt").trim(),
  };
}

const startCalls = (r: Run) =>
  r.calls.filter(
    (c) => c.startsWith("pnpm exec supabase") && !c.includes(" stop"),
  );
const sleeps = (r: Run) =>
  r.calls.filter((c) => c.startsWith("sleep ")).map((c) => c.slice(6));

const TAKEN = (port: number) =>
  `failed to start docker container: Error response from daemon: failed to set up container networking: driver failed programming external connectivity on endpoint supabase_db_conceptapp-v2: failed to bind host port 0.0.0.0:${port}/tcp: address already in use`;

describe.skipIf(process.platform === "win32")("supabase-start.sh", () => {
  it("reserve keeps every port of the config out of the ephemeral range, after what was kept already", () => {
    const r = run(["reserve"], { reserved: "8080" });
    expect(r.status).toBe(0);
    expect(r.reserved).toBe(`8080,${CONFIG_PORTS.join(",")}`);
    expect(r.calls).toContain(
      `sudo sysctl -q -w net.ipv4.ip_local_reserved_ports=8080,${CONFIG_PORTS.join(",")}`,
    );
  });

  it("reserve with nothing kept before adds no leading comma", () => {
    const r = run(["reserve"]);
    expect(r.status).toBe(0);
    expect(r.reserved).toBe(CONFIG_PORTS.join(","));
  });

  it("a clean start runs the CLI once, with the arguments it was given, after reserving", () => {
    const r = run(["db", "start"], { starts: ["ok"] });
    expect(r.status).toBe(0);
    expect(startCalls(r)).toEqual(["pnpm exec supabase db start"]);
    expect(r.reserved).toBe(CONFIG_PORTS.join(","));
    expect(r.calls.some((c) => c.includes("supabase stop"))).toBe(false);
    expect(r.output).not.toContain("::warning::");
    expect(r.output).not.toContain("Started on attempt");
  });

  it("a taken port is diagnosed, cleaned up and tried again with a pause that doubles", () => {
    const r = run(["start", "-x", "realtime,studio"], {
      starts: [TAKEN(54322), TAKEN(54322), "ok"],
    });
    expect(r.status).toBe(0);
    expect(startCalls(r)).toEqual(
      Array(3).fill("pnpm exec supabase start -x realtime,studio"),
    );
    expect(r.output).toContain("Started on attempt 3 of 4.");
    expect(r.output).toContain(
      "::warning::A port the local stack needs was taken (54322) on attempt 1 of 4",
    );
    expect(r.output).toContain("--- Who holds port 54322");
    expect(
      r.calls.filter((c) => c === "pnpm exec supabase stop --no-backup"),
    ).toHaveLength(2);
    expect(r.calls).toContain("sudo ss -K -t state time-wait sport = :54322");
    expect(sleeps(r)).toEqual(["5", "10"]);
  });

  it("waits until the port is free before trying again", () => {
    const r = run(["db", "start"], {
      starts: [TAKEN(54322), "ok"],
      busy: { 54322: 2 },
    });
    expect(r.status).toBe(0);
    expect(r.output).toContain("Port 54322 is free (waited 6s).");
    expect(sleeps(r)).toEqual(["3", "3", "5"]);
  });

  it("goes on after 90 seconds when the port stays busy, and still tries again", () => {
    const r = run(["db", "start"], {
      starts: [TAKEN(54322), "ok"],
      busy: { 54322: 1000 },
    });
    expect(r.status).toBe(0);
    expect(r.output).toContain("Port 54322 is still in use after 90s:");
    expect(sleeps(r).filter((s) => s === "3")).toHaveLength(30);
    expect(startCalls(r)).toHaveLength(2);
  });

  it.each([
    [
      "the older listen error",
      "listen tcp4 0.0.0.0:54321: bind: address already in use",
      "54321",
    ],
    [
      "a port already allocated",
      "Bind for 0.0.0.0:54329 failed: port is already allocated",
      "54329",
    ],
    [
      "an IPv6 address",
      "failed to bind host port [::]:54323/tcp: address already in use",
      "54323",
    ],
    [
      "two ports in one output",
      `${TAKEN(54324)}\\n${TAKEN(54322)}`,
      "54322,54324",
    ],
    [
      "a taken port with no number",
      "Error: address already in use",
      CONFIG_PORTS.join(","),
    ],
  ])("reads the taken port from %s", (_, message, named) => {
    const r = run(["db", "start"], { starts: [message, "ok"] });
    expect(r.status).toBe(0);
    expect(r.output).toContain(`needs was taken (${named}) on attempt 1 of 4`);
  });

  it("any other failure fails at once, with no retry", () => {
    const r = run(["db", "start"], {
      starts: ["Error: failed to pull docker image: toomanyrequests", "ok"],
    });
    expect(r.status).toBe(1);
    expect(startCalls(r)).toHaveLength(1);
    expect(r.output).toContain(
      "::error::supabase db start failed, and not on a taken port",
    );
    expect(r.calls.some((c) => c.includes("supabase stop"))).toBe(false);
  });

  it("a port taken on every attempt fails after four, without cleaning up after the last", () => {
    const r = run(["db", "start"], { starts: Array(5).fill(TAKEN(54322)) });
    expect(r.status).toBe(1);
    expect(startCalls(r)).toHaveLength(4);
    expect(
      r.calls.filter((c) => c === "pnpm exec supabase stop --no-backup"),
    ).toHaveLength(3);
    expect(sleeps(r)).toEqual(["5", "10", "20"]);
    expect(r.output).toContain(
      "::error::A port the local stack needs stayed taken (54322) through 4 attempts of supabase db start",
    );
  });

  it("with no arguments it prints the usage and exits 2", () => {
    const r = run([]);
    expect(r.status).toBe(2);
    expect(r.output).toContain("Usage:");
    expect(r.calls).toEqual([]);
  });
});
