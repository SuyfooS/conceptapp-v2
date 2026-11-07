export type SettingsFailure =
  | "noAccess"
  | "viewOnly"
  | "notAllowed"
  | "invalid"
  | "failed";

export type SettingsResult =
  | { ok: true }
  | { ok: false; failure: SettingsFailure };

/** Saves some of a module's settings. The demo passes a stand-in that stores nothing. */
export type SaveSettings = (
  change: Record<string, unknown>,
) => Promise<SettingsResult>;
