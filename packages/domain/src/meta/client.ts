/**
 * Meta Graph API client for Phase 3.1 (OAuth + connection lifecycle), Phase 3.2 (Business/Ad
 * Account discovery), and Phase 4.1 (Campaign/Ad Set/Ad sync) — meta-adapter-contract.md's
 * remaining methods (getInsights, createCampaign, updateCampaign, etc.) are NOT implemented
 * here; this file implements only OAuth/connection establishment, discovery, and read-only
 * campaign-hierarchy sync. Live-verified endpoints/parameters:
 * - OAuth (2026-09-10, docs/meta/meta-oauth.md §1): developers.facebook.com/docs/
 *   facebook-login/guides/advanced/manual-flow/, .../documentation/facebook-login/guides/
 *   access-tokens/get-long-lived/.
 * - Discovery (2026-09-10, docs/meta/phase-3-2-implementation-report.md §2): developers.
 *   facebook.com/docs/graph-api/reference/user/ (`businesses` edge), .../docs/marketing-api/
 *   reference/ad-account (fields, `account_status` values), `me/adaccounts` endpoint usage,
 *   .../docs/graph-api/results (cursor pagination).
 * - Campaign/Ad Set/Ad sync (2026-09-11, docs/meta/phase-4-1-implementation-report.md §2):
 *   .../docs/marketing-api/reference/ad-campaign-group (Campaign fields, budget-as-integer-
 *   subunit-string representation), .../reference/ad-campaign (Ad Set fields), .../reference/
 *   adgroup (Ad fields).
 *
 * Lives in `packages/domain` (moved here from `apps/api/src/plugins/meta-client.ts` in
 * Phase 4.1) rather than `apps/api` because `workers/sync`'s real job processor is this
 * phase's first caller that isn't an API route — meta-architecture.md §1 design principle 3
 * ("every Meta API call goes through exactly one adapter — no route, worker, or AI tool
 * constructs a raw Meta HTTP request itself") requires one importable adapter, not a
 * route-private one duplicated into the worker.
 *
 * Provider-specific response shapes never leak past this file (meta-adapter-contract.md
 * §2) — every function returns an application-normalized shape. `listBusinesses`/
 * `listAdAccounts` (Phase 3.2) and `listCampaigns`/`listAdSets`/`listAds` (Phase 4.1) are a
 * deliberate, documented extension beyond meta-adapter-contract.md's originally-reconciled
 * single-object `getX(connectionRef, externalId)` lookups — discovery/sync need LISTS, which
 * that shape cannot express; this is an implementation decision, not an architecture gap,
 * exactly like meta-oauth.md §3's state-storage mechanism was left open as "a Phase 3.1
 * implementation decision" by the same document set.
 */

const AUTHORIZE_BASE_URL = "https://www.facebook.com";
const GRAPH_BASE_URL = "https://graph.facebook.com";

/**
 * Minimum verified permission set (OD-3A-02, meta-permissions.md §1–2) — `pages_read_
 * engagement`/`pages_show_list` are required dependencies of `ads_management`/
 * `business_management`, not independently useful capabilities.
 */
export const META_OAUTH_SCOPES = [
  "ads_read",
  "ads_management",
  "business_management",
  "pages_read_engagement",
  "pages_show_list",
] as const;

/** Normalized Meta API failure — never a raw passthrough of Meta's response body. */
export class MetaApiError extends Error {
  readonly metaErrorCode?: number;
  readonly metaErrorSubcode?: number;
  readonly httpStatus: number;

  constructor(
    message: string,
    options: { metaErrorCode?: number; metaErrorSubcode?: number; httpStatus: number },
  ) {
    super(message);
    this.name = "MetaApiError";
    this.metaErrorCode = options.metaErrorCode;
    this.metaErrorSubcode = options.metaErrorSubcode;
    this.httpStatus = options.httpStatus;
  }
}

export function buildMetaAuthorizationUrl(params: {
  appId: string;
  redirectUri: string;
  state: string;
  apiVersion: string;
}): string {
  const url = new URL(`/${params.apiVersion}/dialog/oauth`, AUTHORIZE_BASE_URL);
  url.searchParams.set("client_id", params.appId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("state", params.state);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", META_OAUTH_SCOPES.join(","));
  return url.toString();
}

interface TokenExchangeResult {
  accessToken: string;
  expiresInSeconds?: number;
}

async function callMetaTokenEndpoint(url: URL): Promise<TokenExchangeResult> {
  const response = await fetch(url, { method: "GET" });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw metaErrorFromBody(body, response.status);
  }
  const accessToken = body["access_token"];
  if (typeof accessToken !== "string" || accessToken.length === 0) {
    throw new MetaApiError("Meta token endpoint returned no access_token.", {
      httpStatus: response.status,
    });
  }
  return {
    accessToken,
    expiresInSeconds: typeof body["expires_in"] === "number" ? body["expires_in"] : undefined,
  };
}

/** Server-side authorization-code → short-lived token exchange (meta-oauth.md §1). Never
 *  called from, or with a secret exposed to, the browser. */
export async function exchangeCodeForToken(params: {
  appId: string;
  appSecret: string;
  redirectUri: string;
  code: string;
  apiVersion: string;
}): Promise<TokenExchangeResult> {
  const url = new URL(`/${params.apiVersion}/oauth/access_token`, GRAPH_BASE_URL);
  url.searchParams.set("client_id", params.appId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("client_secret", params.appSecret);
  url.searchParams.set("code", params.code);
  return callMetaTokenEndpoint(url);
}

/** Short-lived → long-lived (~60 day) token exchange (meta-oauth.md §1, meta-token-
 *  security.md §1). */
export async function exchangeForLongLivedToken(params: {
  appId: string;
  appSecret: string;
  shortLivedToken: string;
  apiVersion: string;
}): Promise<TokenExchangeResult> {
  const url = new URL(`/${params.apiVersion}/oauth/access_token`, GRAPH_BASE_URL);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", params.appId);
  url.searchParams.set("client_secret", params.appSecret);
  url.searchParams.set("fb_exchange_token", params.shortLivedToken);
  return callMetaTokenEndpoint(url);
}

export interface MetaTokenDebugInfo {
  isValid: boolean;
  appId?: string;
  userId?: string;
  scopes: string[];
  expiresAt?: Date;
}

/** Token validation via `debug_token` (meta-oauth.md §1, Step 6). */
export async function validateMetaToken(params: {
  inputToken: string;
  appId: string;
  appSecret: string;
  apiVersion: string;
}): Promise<MetaTokenDebugInfo> {
  const url = new URL(`/${params.apiVersion}/debug_token`, GRAPH_BASE_URL);
  url.searchParams.set("input_token", params.inputToken);
  // App access token shorthand — {app-id}|{app-secret} — avoids a separate network round
  // trip to mint one, per Meta's own documented convention.
  url.searchParams.set("access_token", `${params.appId}|${params.appSecret}`);

  const response = await fetch(url, { method: "GET" });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw metaErrorFromBody(body, response.status);
  }
  const data = (body["data"] as Record<string, unknown> | undefined) ?? {};
  const expiresAtRaw = data["expires_at"];
  return {
    isValid: data["is_valid"] === true,
    appId: typeof data["app_id"] === "string" ? data["app_id"] : undefined,
    userId: typeof data["user_id"] === "string" ? data["user_id"] : undefined,
    scopes: Array.isArray(data["scopes"]) ? (data["scopes"] as string[]) : [],
    expiresAt:
      typeof expiresAtRaw === "number" && expiresAtRaw > 0
        ? new Date(expiresAtRaw * 1000)
        : undefined,
  };
}

export interface MetaIdentity {
  id: string;
}

/** Minimal authorized-identity retrieval (`GET /me`) — Phase 3.1 OAuth scope; full business/
 *  ad-account discovery is `listBusinesses`/`listAdAccounts` below (Phase 3.2). */
export async function getMetaIdentity(params: {
  accessToken: string;
  apiVersion: string;
}): Promise<MetaIdentity> {
  const url = new URL(`/${params.apiVersion}/me`, GRAPH_BASE_URL);
  url.searchParams.set("access_token", params.accessToken);
  url.searchParams.set("fields", "id");

  const response = await fetch(url, { method: "GET" });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw metaErrorFromBody(body, response.status);
  }
  const id = body["id"];
  if (typeof id !== "string") {
    throw new MetaApiError("Meta /me response did not include an id.", {
      httpStatus: response.status,
    });
  }
  return { id };
}

export interface MetaBusinessSummary {
  id: string;
  name: string;
  verificationStatus?: string;
}

export interface MetaAdAccountSummary {
  /** Meta's `act_{id}` form — round-trips directly into Graph API calls. */
  id: string;
  accountId: string;
  name: string;
  currency: string;
  timezoneName: string;
  /** Normalized from Meta's numeric `account_status` — never the raw code (see
   *  `normalizeAccountStatus` below). `"UNKNOWN"` for any code this application doesn't yet
   *  recognize, rather than throwing — a future Meta status code must never break discovery. */
  accountStatus: string;
  business: { id: string; name: string } | null;
}

/** Live-verified 2026-09-10, `developers.facebook.com/docs/marketing-api/reference/ad-account`. */
const AD_ACCOUNT_STATUS_MAP: Record<number, string> = {
  1: "ACTIVE",
  2: "DISABLED",
  3: "UNSETTLED",
  7: "PENDING_RISK_REVIEW",
  8: "PENDING_SETTLEMENT",
  9: "IN_GRACE_PERIOD",
  100: "PENDING_CLOSURE",
  101: "CLOSED",
  201: "ANY_ACTIVE",
  202: "ANY_CLOSED",
};

function normalizeAccountStatus(code: unknown): string {
  return typeof code === "number" && code in AD_ACCOUNT_STATUS_MAP
    ? AD_ACCOUNT_STATUS_MAP[code]!
    : "UNKNOWN";
}

/** Safety bound against a runaway pagination loop — no caller-supplied or Meta-supplied
 *  input can make a discovery call fetch unboundedly (meta-rate-limits.md §5's AI-loop-
 *  protection principle, generalized here to every caller, not only a future AI tool). */
const MAX_DISCOVERY_PAGES = 20;

/** Follows Meta's cursor-based `paging.next` (meta-adapter-contract.md §4) until absent or
 *  `MAX_DISCOVERY_PAGES` is reached — never silently truncates a result set at the first
 *  page, per the same contract. */
async function fetchAllPages<TItem>(startUrl: URL): Promise<TItem[]> {
  const results: TItem[] = [];
  let nextUrl: string | undefined = startUrl.toString();
  let pages = 0;

  while (nextUrl && pages < MAX_DISCOVERY_PAGES) {
    const response = await fetch(nextUrl, { method: "GET" });
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      throw metaErrorFromBody(body, response.status);
    }
    const data = body["data"];
    if (Array.isArray(data)) {
      results.push(...(data as TItem[]));
    }
    const paging = body["paging"] as Record<string, unknown> | undefined;
    nextUrl = typeof paging?.["next"] === "string" ? (paging["next"] as string) : undefined;
    pages += 1;
  }

  return results;
}

/** Businesses associated with the connected user (`meta-account-discovery.md` §2's "List
 *  authorized Businesses"). Live-verified 2026-09-10,
 *  `developers.facebook.com/docs/graph-api/reference/user/` (`businesses` edge). */
export async function listBusinesses(params: {
  accessToken: string;
  apiVersion: string;
}): Promise<MetaBusinessSummary[]> {
  const url = new URL(`/${params.apiVersion}/me/businesses`, GRAPH_BASE_URL);
  url.searchParams.set("access_token", params.accessToken);
  url.searchParams.set("fields", "id,name,verification_status");
  url.searchParams.set("limit", "100");

  const rows = await fetchAllPages<Record<string, unknown>>(url);
  return rows
    .filter(
      (row): row is Record<string, unknown> & { id: string; name: string } =>
        typeof row["id"] === "string" && typeof row["name"] === "string",
    )
    .map((row) => ({
      id: row["id"],
      name: row["name"],
      verificationStatus:
        typeof row["verification_status"] === "string" ? row["verification_status"] : undefined,
    }));
}

/** Ad accounts the connected user can access — directly-shared or via any Business
 *  (`me/adaccounts` already aggregates both, meta-account-discovery.md §2). Live-verified
 *  2026-09-10, `developers.facebook.com/docs/marketing-api/reference/ad-account` (fields) and
 *  corroborated endpoint usage (`me/adaccounts?fields=...`). */
export async function listAdAccounts(params: {
  accessToken: string;
  apiVersion: string;
}): Promise<MetaAdAccountSummary[]> {
  const url = new URL(`/${params.apiVersion}/me/adaccounts`, GRAPH_BASE_URL);
  url.searchParams.set("access_token", params.accessToken);
  url.searchParams.set(
    "fields",
    "id,account_id,name,currency,timezone_name,account_status,business{id,name}",
  );
  url.searchParams.set("limit", "100");

  const rows = await fetchAllPages<Record<string, unknown>>(url);
  return rows
    .filter(
      (row): row is Record<string, unknown> & { id: string; account_id: string; name: string } =>
        typeof row["id"] === "string" &&
        typeof row["account_id"] === "string" &&
        typeof row["name"] === "string",
    )
    .map((row) => {
      const business = row["business"] as Record<string, unknown> | undefined;
      return {
        id: row["id"],
        accountId: row["account_id"],
        name: row["name"],
        currency: typeof row["currency"] === "string" ? row["currency"] : "",
        timezoneName: typeof row["timezone_name"] === "string" ? row["timezone_name"] : "",
        accountStatus: normalizeAccountStatus(row["account_status"]),
        business:
          business && typeof business["id"] === "string" && typeof business["name"] === "string"
            ? { id: business["id"], name: business["name"] }
            : null,
      };
    });
}

/** Meta returns budget/spend fields as numeric strings representing an integer value in the
 *  currency's subunit (e.g. cents) — live-verified 2026-09-11, `developers.facebook.com/docs/
 *  marketing-api/reference/ad-campaign-group`. Parsed to `BigInt`, never a JS `number`/
 *  `Float` (money-handling rule) — `null` for anything absent or unparseable, never `0` (a
 *  missing budget is not the same fact as a zero budget). */
function parseOptionalBigInt(value: unknown): bigint | null {
  if (typeof value !== "string" || value.length === 0) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

/** Meta's `*_time` fields are ISO-8601-shaped datetime strings — `null` for anything absent
 *  or unparseable, never a guessed date (an adapter-layer response-validation boundary,
 *  meta-adapter-contract.md §2 / meta-threat-model.md #16). */
function parseOptionalDate(value: unknown): Date | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export interface MetaCampaignSummary {
  id: string;
  name: string;
  status: string;
  effectiveStatus: string;
  objective: string;
  dailyBudget: bigint | null;
  lifetimeBudget: bigint | null;
  budgetRemaining: bigint | null;
  startTime: Date | null;
  stopTime: Date | null;
  updatedTime: Date | null;
}

/** Campaigns under an ad account (`meta-adapter-contract.md` §1's `listCampaigns`). Live-
 *  verified 2026-09-11, `developers.facebook.com/docs/marketing-api/reference/
 *  ad-campaign-group`: `GET /act_{ad_account_id}/campaigns`. */
export async function listCampaigns(params: {
  accessToken: string;
  apiVersion: string;
  /** Meta's own `act_{id}` form (matches `AdAccount.externalId` exactly). */
  externalAdAccountId: string;
}): Promise<MetaCampaignSummary[]> {
  const url = new URL(
    `/${params.apiVersion}/${params.externalAdAccountId}/campaigns`,
    GRAPH_BASE_URL,
  );
  url.searchParams.set("access_token", params.accessToken);
  url.searchParams.set(
    "fields",
    "id,name,status,effective_status,objective,daily_budget,lifetime_budget,budget_remaining,start_time,stop_time,updated_time",
  );
  url.searchParams.set("limit", "100");

  const rows = await fetchAllPages<Record<string, unknown>>(url);
  return rows
    .filter(
      (
        row,
      ): row is Record<string, unknown> & {
        id: string;
        name: string;
        status: string;
        effective_status: string;
        objective: string;
      } =>
        typeof row["id"] === "string" &&
        typeof row["name"] === "string" &&
        typeof row["status"] === "string" &&
        typeof row["effective_status"] === "string" &&
        typeof row["objective"] === "string",
    )
    .map((row) => ({
      id: row["id"],
      name: row["name"],
      status: row["status"],
      effectiveStatus: row["effective_status"],
      objective: row["objective"],
      dailyBudget: parseOptionalBigInt(row["daily_budget"]),
      lifetimeBudget: parseOptionalBigInt(row["lifetime_budget"]),
      budgetRemaining: parseOptionalBigInt(row["budget_remaining"]),
      startTime: parseOptionalDate(row["start_time"]),
      stopTime: parseOptionalDate(row["stop_time"]),
      updatedTime: parseOptionalDate(row["updated_time"]),
    }));
}

export interface MetaAdSetSummary {
  id: string;
  name: string;
  status: string;
  effectiveStatus: string;
  optimizationGoal: string | null;
  billingEvent: string | null;
  bidStrategy: string | null;
  dailyBudget: bigint | null;
  lifetimeBudget: bigint | null;
  startTime: Date | null;
  endTime: Date | null;
  updatedTime: Date | null;
}

/** Ad sets under a campaign (`meta-adapter-contract.md` §1's `listAdSets(connectionRef,
 *  externalCampaignId, cursor?)` — already-decided shape). Live-verified 2026-09-11,
 *  `developers.facebook.com/docs/marketing-api/reference/ad-campaign`: `GET /{campaign_id}/
 *  adsets`. */
export async function listAdSets(params: {
  accessToken: string;
  apiVersion: string;
  externalCampaignId: string;
}): Promise<MetaAdSetSummary[]> {
  const url = new URL(`/${params.apiVersion}/${params.externalCampaignId}/adsets`, GRAPH_BASE_URL);
  url.searchParams.set("access_token", params.accessToken);
  url.searchParams.set(
    "fields",
    "id,name,status,effective_status,optimization_goal,billing_event,bid_strategy,daily_budget,lifetime_budget,start_time,end_time,updated_time",
  );
  url.searchParams.set("limit", "100");

  const rows = await fetchAllPages<Record<string, unknown>>(url);
  return rows
    .filter(
      (
        row,
      ): row is Record<string, unknown> & {
        id: string;
        name: string;
        status: string;
        effective_status: string;
      } =>
        typeof row["id"] === "string" &&
        typeof row["name"] === "string" &&
        typeof row["status"] === "string" &&
        typeof row["effective_status"] === "string",
    )
    .map((row) => ({
      id: row["id"],
      name: row["name"],
      status: row["status"],
      effectiveStatus: row["effective_status"],
      optimizationGoal:
        typeof row["optimization_goal"] === "string" ? row["optimization_goal"] : null,
      billingEvent: typeof row["billing_event"] === "string" ? row["billing_event"] : null,
      bidStrategy: typeof row["bid_strategy"] === "string" ? row["bid_strategy"] : null,
      dailyBudget: parseOptionalBigInt(row["daily_budget"]),
      lifetimeBudget: parseOptionalBigInt(row["lifetime_budget"]),
      startTime: parseOptionalDate(row["start_time"]),
      endTime: parseOptionalDate(row["end_time"]),
      updatedTime: parseOptionalDate(row["updated_time"]),
    }));
}

export interface MetaAdSummary {
  id: string;
  name: string;
  status: string;
  effectiveStatus: string;
  creative: { id: string; name: string | null } | null;
  updatedTime: Date | null;
}

/** Ads under an ad set (`meta-adapter-contract.md` §1's `listAds`). Live-verified
 *  2026-09-11, `developers.facebook.com/docs/marketing-api/reference/adgroup`:
 *  `GET /{adset_id}/ads`. */
export async function listAds(params: {
  accessToken: string;
  apiVersion: string;
  externalAdSetId: string;
}): Promise<MetaAdSummary[]> {
  const url = new URL(`/${params.apiVersion}/${params.externalAdSetId}/ads`, GRAPH_BASE_URL);
  url.searchParams.set("access_token", params.accessToken);
  url.searchParams.set("fields", "id,name,status,effective_status,creative{id,name},updated_time");
  url.searchParams.set("limit", "100");

  const rows = await fetchAllPages<Record<string, unknown>>(url);
  return rows
    .filter(
      (
        row,
      ): row is Record<string, unknown> & {
        id: string;
        name: string;
        status: string;
        effective_status: string;
      } =>
        typeof row["id"] === "string" &&
        typeof row["name"] === "string" &&
        typeof row["status"] === "string" &&
        typeof row["effective_status"] === "string",
    )
    .map((row) => {
      const creative = row["creative"] as Record<string, unknown> | undefined;
      return {
        id: row["id"],
        name: row["name"],
        status: row["status"],
        effectiveStatus: row["effective_status"],
        creative:
          creative && typeof creative["id"] === "string"
            ? {
                id: creative["id"],
                name: typeof creative["name"] === "string" ? creative["name"] : null,
              }
            : null,
        updatedTime: parseOptionalDate(row["updated_time"]),
      };
    });
}

function metaErrorFromBody(body: Record<string, unknown>, httpStatus: number): MetaApiError {
  const error = (body["error"] as Record<string, unknown> | undefined) ?? {};
  const message =
    typeof error["message"] === "string" ? error["message"] : "Unknown Meta API error";
  const metaErrorCode = typeof error["code"] === "number" ? error["code"] : undefined;
  const metaErrorSubcode =
    typeof error["error_subcode"] === "number" ? error["error_subcode"] : undefined;
  return new MetaApiError(message, { metaErrorCode, metaErrorSubcode, httpStatus });
}
