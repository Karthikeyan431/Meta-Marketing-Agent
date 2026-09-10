/**
 * Minimal Meta Graph API client for Phase 3.1 (OAuth + connection lifecycle only) —
 * meta-adapter-contract.md's full interface (listCampaigns, getInsights, etc.) is NOT
 * implemented here; this phase implements only what OAuth/connection establishment needs.
 * Live-verified endpoints/parameters, 2026-09-10 (docs/meta/meta-oauth.md §1):
 * developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow/,
 * .../documentation/facebook-login/guides/access-tokens/get-long-lived/.
 *
 * Provider-specific response shapes never leak past this file (meta-adapter-contract.md
 * §2) — every function returns an application-normalized shape.
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

/** Minimal authorized-identity retrieval (`GET /me`) — Phase 3.1 scope only; full account/
 *  business discovery is Phase 3.3 (meta-account-discovery.md), not implemented here. */
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

function metaErrorFromBody(body: Record<string, unknown>, httpStatus: number): MetaApiError {
  const error = (body["error"] as Record<string, unknown> | undefined) ?? {};
  const message =
    typeof error["message"] === "string" ? error["message"] : "Unknown Meta API error";
  const metaErrorCode = typeof error["code"] === "number" ? error["code"] : undefined;
  const metaErrorSubcode =
    typeof error["error_subcode"] === "number" ? error["error_subcode"] : undefined;
  return new MetaApiError(message, { metaErrorCode, metaErrorSubcode, httpStatus });
}
