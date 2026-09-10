import { randomUUID } from "node:crypto";
import { getRedisConnection } from "@ai-marketing-manager/queue";

/**
 * OAuth state storage (meta-oauth.md §3) — Redis, not a database table, per this project's
 * own architecture recommendation ("a short-TTL Redis key... is the natural fit given the
 * existing dependency and the short-lived, single-use nature of the value"). Reuses the
 * already-shipped `getRedisConnection()` from `@ai-marketing-manager/queue` — no new
 * infrastructure dependency.
 *
 * The redirect URI is never part of the stored payload — it is a single, fixed,
 * server-configured value (`META_OAUTH_REDIRECT_URI`), never client-suppliable, so there is
 * nothing to separately bind or compare (meta-oauth.md §4).
 */

const STATE_TTL_SECONDS = 600; // 10 minutes
const STATE_KEY_PREFIX = "meta:oauth:state:";

export interface OAuthStatePayload {
  userId: string;
  workspaceId: string;
}

/** Atomic get-and-delete via a single Lua script — guarantees single-use regardless of
 *  ioredis/Redis version, avoiding a GET-then-DEL race between two near-simultaneous
 *  consumption attempts (meta-threat-model.md #2, OAuth state replay). */
const CONSUME_SCRIPT = `
local v = redis.call('GET', KEYS[1])
if v then redis.call('DEL', KEYS[1]) end
return v
`;

/** High-entropy (crypto-random UUID), short-lived (10 min TTL), bound to the initiating
 *  user + workspace (meta-oauth.md §3). */
export async function createOAuthState(
  redisUrl: string,
  payload: OAuthStatePayload,
): Promise<string> {
  const token = randomUUID();
  const redis = getRedisConnection(redisUrl);
  await redis.set(`${STATE_KEY_PREFIX}${token}`, JSON.stringify(payload), "EX", STATE_TTL_SECONDS);
  return token;
}

/** Single-use: returns the payload exactly once, then the state is gone — a second call
 *  with the same token (a replay) returns `null`, identical to an invalid/expired token
 *  (no distinguishing signal, matching this project's non-disclosure convention). */
export async function consumeOAuthState(
  redisUrl: string,
  token: string,
): Promise<OAuthStatePayload | null> {
  const redis = getRedisConnection(redisUrl);
  const raw = await redis.eval(CONSUME_SCRIPT, 1, `${STATE_KEY_PREFIX}${token}`);
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      typeof (parsed as Record<string, unknown>)["userId"] === "string" &&
      typeof (parsed as Record<string, unknown>)["workspaceId"] === "string"
    ) {
      return parsed as OAuthStatePayload;
    }
    return null;
  } catch {
    return null;
  }
}
