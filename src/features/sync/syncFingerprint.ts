export interface SyncFields {
  remote: string;
  username: string;
  /** Empty means "keep the stored token". */
  token: string;
  name: string;
  email: string;
}

/** Identifies the exact values a connection test approved. Any change requires a new test. */
export function fingerprint(fields: SyncFields): string {
  return JSON.stringify([
    fields.remote.trim(),
    fields.username.trim(),
    fields.token,
    fields.name.trim(),
    fields.email.trim(),
  ]);
}
