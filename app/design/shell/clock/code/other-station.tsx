"use client";

import { useState } from "react";
import type { CodeScreenData } from "../../../../(app)/clock/code/code";
import {
  type CodePaths,
  CodeScreen,
} from "../../../../(app)/clock/code/code-screen";
import type { LockAction } from "../../../../(app)/clock/station/station-types";

/**
 * The code screen's twin on a device that is already the business's
 * kitchen's screen (`?other=prep`): the lock offers to stop it first, and
 * once stopped the lock opens, with "ביטול" in the toast to start it again
 * (`restarts`), or none, as for someone who can't start it again; or the
 * stop refused (`refuses`): no signal, so nothing changes, or the kitchen's
 * screen gone meanwhile, so the lock opens. What the screen reads again
 * after each (the real one's `refresh()`) is kept here, in the page, so
 * nothing is stored: a new visit starts over.
 */
export function OtherStationCode({
  data,
  issueUrl,
  paths,
  running,
  station,
  lock,
  restarts = true,
  refuses,
}: {
  data: CodeScreenData;
  issueUrl: string;
  paths: CodePaths;
  /** The clock stations running, for the name a new one is offered. */
  running: string[];
  /** The kitchen's screen the device is. */
  station: { id: string; name: string };
  lock: LockAction;
  /** Whether the stop offers a way back ("ביטול"). */
  restarts?: boolean;
  /** The stop refused, and why. */
  refuses?: "failed" | "gone";
}) {
  const [stopped, setStopped] = useState(false);
  return (
    <CodeScreen
      data={data}
      issueUrl={issueUrl}
      paths={paths}
      lock={{
        offer: {
          current: null,
          running,
          other: stopped ? null : { name: station.name, shows: "prep" },
        },
        action: lock,
        clearsDevice: false,
        stopOther: {
          stop: async () => {
            if (refuses === "failed") return { ok: false, failure: "failed" };
            setStopped(true);
            if (refuses === "gone") return { ok: false, failure: "gone" };
            return { ok: true, undo: restarts ? station.id : null };
          },
          restart: async () => {
            setStopped(false);
            return { ok: true };
          },
        },
      }}
    />
  );
}
