// The Idempotency-Key rules of AD-5 and SEC-8, shared by book and reschedule.
import type { Actor } from "./actor";
import type { EpochMs } from "../domain/model";
import type { IdempotencyRecord, ReadStores } from "./ports";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([k, v]) => [k, canonical(v)]),
    );
  }
  return value;
}

/** SHA-256 of the command name and the body, so a key cannot be reused on another command (SEC-8.AC-3). */
export async function requestHash(
  command: string,
  body: unknown,
): Promise<string> {
  const text = JSON.stringify({ command, body: canonical(body) });
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** What the saved response holds: ids only (SEC-8.AC-5). */
export interface SavedResponse {
  appointmentId: string;
}

export type KeyLookup =
  | { kind: "new" }
  | { kind: "same"; response: SavedResponse }
  | { kind: "reused" };

export async function lookupKey(
  stores: Pick<ReadStores, "idempotency">,
  actor: Actor,
  key: string,
  hash: string,
): Promise<KeyLookup> {
  const saved = await stores.idempotency.get(actor.userId, key);
  if (!saved) return { kind: "new" };
  return saved.requestHash === hash
    ? { kind: "same", response: saved.response as SavedResponse }
    : { kind: "reused" };
}

export function keyRecord(
  actor: Actor,
  key: string,
  hash: string,
  appointmentId: string,
  now: EpochMs,
): IdempotencyRecord {
  return {
    actorId: actor.userId,
    key,
    requestHash: hash,
    response: { appointmentId } satisfies SavedResponse,
    createdAt: now,
  };
}
