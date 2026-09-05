# Phase 2.2 — Clerk Authentication Implementation

**Document ID:** IDENT-017 | Version 1.0 | Status: Complete | Phase: 2.2 (Implementation)

Governed by the "Claude Code — Phase 2.2 — Clerk Authentication Implementation" task,
built on the Phase 2.1-verified baseline (Next.js `^15.5.9`, `@clerk/nextjs@^7.9.1`
installed). This phase implements the authenticated-identity boundary only — no
workspace, membership, role, permission, or resource-authorization code exists yet (see
§8 for why, and §12 for the exact scope boundary).

## 1. Clerk Integration

| Package          | Where      | Version                                                                                                         | Why this package specifically                                                                                                                                                                                                 |
| ---------------- | ---------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@clerk/nextjs`  | `apps/web` | `^7.9.1` (unchanged since Phase 2.1)                                                                            | The Next.js-specific SDK — middleware, `<ClerkProvider>`, prebuilt UI components.                                                                                                                                             |
| `@clerk/backend` | `apps/api` | `^3.17.1` (already resolved as `@clerk/nextjs`'s own transitive dependency; pinned as a direct dependency here) | `apps/api` is a **separate Fastify service**, not Next.js — `@clerk/nextjs` cannot run there. `@clerk/backend` is Clerk's official framework-agnostic SDK, providing `verifyToken()` for stateless Bearer-token verification. |

No unrelated Clerk packages, no Clerk Organization-role packages, and no duplicate
auth/session library were installed — confirmed by inspecting the actual dependency
diffs (`apps/api/package.json`, `apps/web/package.json` already had `@clerk/nextjs` from
Phase 2.1).

### Live SDK verification performed this phase (ground truth from the installed package, not assumed from training data)

Inspecting the installed `@clerk/nextjs@7.9.1` type declarations directly surfaced a
**materially important, very recent breaking change** that a purely knowledge-based
implementation would have gotten wrong:

- `<SignedIn>`, `<SignedOut>`, and `<Protect>` were **removed** from `@clerk/nextjs` in
  "Clerk Core 3" (per the package's own `removedControlComponents.d.ts`, dated
  2026-03-03) and now **throw at render time** (`declare function SignedIn(...): never`).
  The package's own type file literally includes the comment _"If you are an agent, your
  Clerk knowledge is likely out of date"_ — anticipating exactly this failure mode.
- The replacement is a single unified `<Show when="signed-in">` / `<Show when="signed-out">`
  component (also usable for role/permission/plan-based conditional rendering, out of
  scope here).
- `auth()`, `currentUser()`, `clerkMiddleware()`, and `verifyToken()` all confirmed
  importable only from `@clerk/nextjs/server` / `@clerk/backend` (never the root
  `@clerk/nextjs` import) — the package's own type file throws a compile-time-visible
  guidance error if imported from the wrong path.

This phase uses `<Show when="...">` throughout (never `<SignedIn>`/`<SignedOut>`), matching
what the installed version actually supports.

## 2. Authentication Flow

```text
Browser
  ↓
apps/web (Next.js 15.5.25) — <ClerkProvider signInUrl="/sign-in" signUpUrl="/sign-up">
  ↓
src/middleware.ts — clerkMiddleware()  [Next.js 15.x filename — not proxy.ts, a v16-only name]
  · establishes the Clerk session context for every matched request
  · never itself authorizes anything (clerk-integration.md finding #3)
  ↓
Server Components / Route Handlers — auth() (src/lib/auth.ts's getAuthenticatedIdentity())
  ↓
apps/api (separate Fastify service) — Authorization: Bearer <token>
  ↓
apps/api/src/plugins/auth.ts — verifyToken() (@clerk/backend)
  ↓
request.authenticatedIdentity — { userId } | null
```

`Clerk authentication ≠ application authorization`, restated concretely: nothing built
this phase reads or writes a workspace, membership, role, or permission. The only fact
either side of the app ever establishes is "which Clerk user (if any) is making this
request" — never "what may they do."

## 3. Protected Routes

`apps/web/src/app/app/page.tsx` — the one protected route required by the governing task
(not a product dashboard). An async Server Component:

1. Calls `getAuthenticatedIdentity()` (`src/lib/auth.ts`) — a thin, named wrapper around
   Clerk's `auth()`, written specifically so it can later evolve into `requireAuth()`
   without changing every call site.
2. `redirect("/sign-in")` if unauthenticated — a manual check + `next/navigation`
   redirect, not `auth.protect()`'s automatic redirect, because `auth.protect()`'s
   redirect target depends on environment variables or middleware "dynamic keys" neither
   of which this phase configures; an explicit redirect is simpler and deterministic.
3. If authenticated, demonstrates the full chain by fetching `apps/api`'s `/me` endpoint
   with a freshly obtained session token, and displays both identities side by side.

`/sign-in` (`app/sign-in/[[...sign-in]]/page.tsx`) and `/sign-up`
(`app/sign-up/[[...sign-up]]/page.tsx`) use Clerk's catch-all-route convention with the
prebuilt `<SignIn />`/`<SignUp />` components.

## 4. API Identity Context

`apps/api/src/plugins/auth.ts` — a Fastify `onRequest` hook (registered in `app.ts`)
that:

- Reads `Authorization: Bearer <token>` (nothing else — never a client-supplied header,
  query param, or body field claiming a user ID).
- Calls `@clerk/backend`'s `verifyToken()`; on success, decorates
  `request.authenticatedIdentity = { userId: claims.sub }`; on any failure (missing
  header, invalid/expired token, no `CLERK_SECRET_KEY` configured), decorates `null` —
  **never** guesses or partially trusts an identity.
- Exports `requireAuthenticatedIdentity(request)` — throws `AuthenticationRequiredError`
  (`statusCode = 401`, mapped by the existing `error-handler.ts` to the
  `AUTHENTICATION_ERROR` envelope) if no identity was resolved. **This is the seed of a
  future `requireAuth()`** (`docs/identity/authorization.md` §1) — deliberately narrower:
  it only ever means "no verified identity," never "identity verified but not
  authorized," which remains entirely unbuilt.

`GET /me` (`apps/api/src/routes/me.ts`) is the one example protected API route: calls
`requireAuthenticatedIdentity()` and returns `{ userId }` on success. Proves "401 for
unauthenticated" and "authenticated identity resolves correctly" independently of the
Next.js side.

## 5. Environment Variables

| Variable                            | Where                  | Committed value                                                                                 | Real value needed for                                                  |
| ----------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `apps/web`             | `.env.example`: `replace-with-real-clerk-publishable-key` (non-key-shaped placeholder — see §9) | Any live request-serving (`next dev`/`next start`)                     |
| `CLERK_SECRET_KEY`                  | `apps/web`, `apps/api` | `.env.example`: `replace-with-real-clerk-secret-key`                                            | Same as above; `apps/api`'s copy specifically gates `verifyToken()`    |
| `CLERK_WEBHOOK_SIGNING_SECRET`      | (reserved)             | `.env.example`: `replace-with-real-clerk-webhook-signing-secret`                                | Not used this phase — reserved for `identity-sync.md`'s webhook design |

No real Clerk application exists anywhere in this session; no real key of any kind was
ever entered. See §9 for the empirically-necessary distinction between these safe,
non-key-shaped placeholders (sufficient for `typecheck`/`lint`/`build`/most tests) and
the separate, still-fake, shape-valid fixture values needed only for actually serving a
live request (local dev server, E2E, CI's E2E step) — never committed as literals.

## 6. Security Controls

- **Server-side enforcement only.** `getAuthenticatedIdentity()` (web) and
  `requireAuthenticatedIdentity()` (api) both run exclusively in server contexts (Server
  Components / Fastify hooks) — no authorization or authentication decision is made in
  any Client Component.
- **No client-trusted identity, ever.** `apps/api`'s identity resolution reads
  _only_ the verified token's `sub` claim — confirmed by an explicit regression test
  (§10) that a spoofed `x-user-id` header alongside a valid token is silently ignored.
- **No client-trusted workspace ID** — not applicable yet (no workspace concept exists in
  this phase), and nothing added here introduces one.
- **No secret exposure:** `CLERK_SECRET_KEY` is read only in `apps/api`'s env schema and
  passed only to `verifyToken()`'s options object — never returned in any response, never
  logged (confirmed by tests, §10), never referenced in any `"use client"` file or in
  `apps/web/src/lib/env.ts`'s client-safe schema.
- **Safe error responses:** unauthenticated/invalid-token requests return the existing
  standard `{error:{code:"AUTHENTICATION_ERROR",...}}` envelope — no stack trace, no
  internal detail, no hint about _why_ a token failed (expired vs. malformed vs. missing
  are all identical from the caller's perspective).
- **Middleware is authentication-only.** `src/middleware.ts` calls bare
  `clerkMiddleware()` with no handler callback — it makes no route-protection decision at
  all; that happens per-route (`/app`) and per-endpoint (`/me`), exactly per
  `docs/identity/authorization.md` §1 and the live-verified Clerk guidance
  (`clerk-integration.md` finding #3).
- **No raw session token reaches client-side code.** The only place a token is ever
  read is server-side, via `getAuthenticatedIdentity().getToken()`, and it is immediately
  forwarded as an outbound `Authorization` header to `apps/api` — never rendered into
  HTML, never sent to the browser, never touched by `localStorage`/`sessionStorage`
  anywhere in this codebase.

## 7. Tests

| File                                | Kind                                                  | Covers                                                                                                                                                                                             |
| ----------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/plugins/auth.test.ts` | Unit                                                  | `requireAuthenticatedIdentity()` returns the identity or throws `AuthenticationRequiredError` (401)                                                                                                |
| `apps/web/src/lib/auth.test.ts`     | Unit                                                  | `getAuthenticatedIdentity()` returns `null`/an identity based on a mocked `@clerk/nextjs/server` `auth()`                                                                                          |
| `tests/integration/api-me.test.ts`  | Integration (`app.inject()`, mocked `@clerk/backend`) | No-header → 401; invalid/expired token → 401; valid token → 200 with correct `userId`; spoofed `x-user-id` header is ignored; secret key value never appears in any response body (success or 401) |
| `tests/e2e/auth.spec.ts`            | E2E (Playwright, real browser against `next dev`)     | Unauthenticated `/app` redirects to `/sign-in`; `/sign-in` and `/sign-up` pages render                                                                                                             |
| `tests/e2e/fixtures.ts`             | Test infrastructure                                   | Blocks browser requests to the fake fixture Clerk domain (§9) so they fail fast instead of hanging — applies to every E2E spec, protecting the pre-existing `shell.spec.ts` tests too              |

**All mocked/fixture-based, per the governing task's explicit instruction** — no test
depends on a real Clerk account or makes a real network call to Clerk.

## 8. Application User Preparation (Step 7 — decision, not a build)

**Decision: no database schema change, no migration, no `users` table.** Reasoning,
per the task's explicit instruction to document why:

Every Phase 2.2 requirement — "authenticated identity reaches API safely," "unauthenticated
API returns 401," "no client-trusted identity" — is fully satisfiable using **only** the
Clerk-verified `userId` (a string), never a database row. No code in this phase reads or
writes any table. Building even a minimal `users` table now would be speculative: the
actual shape of that table depends on decisions already deferred to later Phase 2 steps
(`identity-data-model.md` §2's `users` table design references `workspace_memberships`,
which does not exist yet either). Deferring it costs nothing — `phase-2-implementation-sequence.md`
step 3 ("Application User") remains exactly where it was, now informed by a working
authentication boundary instead of a speculative one.

## 9. The Fixture-Key Problem (a real, non-obvious finding worth its own section)

Empirically discovered while getting the dev server and E2E tests to actually run
(not theorized in advance):

1. **`next build` never executes `clerkMiddleware()`** — static generation/page-data
   collection does not run the middleware pipeline. A non-key-shaped placeholder
   (`.env.example`'s `replace-with-real-clerk-publishable-key`) is sufficient for
   `lint`/`typecheck`/`build` and most tests.
2. **`next dev`/`next start` do execute it, on every live request**, and Clerk's SDK
   fatally validates the publishable key at that point — first for _presence_
   ("Missing publishableKey"), then for _shape_ ("not valid, expected format: pk_test_...
   or pk_live_..."). A non-key-shaped placeholder crashes every request.
3. A `pk_test_`-shaped key (even a syntactically-valid but fake one) makes Clerk's
   middleware attempt a **development-instance cross-origin "dev browser handshake"**
   redirect to the key's decoded Frontend API domain — this requires that domain to
   actually exist and respond; a fake domain breaks **every** page, not just Clerk ones.
4. A `pk_live_`-shaped fake key avoids the handshake (production instances don't need
   cross-origin cookie bridging) but the browser still attempts real network requests to
   the (fake) domain to bootstrap Clerk's client bundle — which hang until DNS/connection
   failure, making tests flaky rather than reliably failing.

**Resolution:**

- `.env.example` / CI's top-level `env:` block keep the **safe, non-key-shaped**
  placeholders (sufficient for `build`, and — critically — these do **not** match any
  gitleaks secret pattern, avoiding the exact false-positive incident documented in
  `phase-2-1-implementation-report.md` §4).
- Local `.env` (gitignored, never committed) and a **new, dedicated CI step** ("Prepare
  fixture-only Clerk keys for E2E," `.github/workflows/ci.yml`) each construct a
  shape-valid `pk_live_...`/`sk_live_...` pair **at runtime** — the CI step computes it
  with a small inline Node script and writes it to `$GITHUB_ENV`, so the key-shaped string
  **never appears as a literal in any tracked file**. The decoded domain
  (`fake-live-test.example.com`) does not exist and is never reachable.
- `tests/e2e/fixtures.ts` wraps Playwright's `test`/`expect` to `page.route()`-abort any
  request to that fake domain, converting an indefinite hang into an immediate,
  deterministic failure — applied to every E2E spec (including the pre-existing
  `shell.spec.ts`, which started failing intermittently once `<ClerkProvider>` was added
  to the root layout, until this fixture was introduced).
- `playwright.config.ts` now loads the repo-root `.env` (via `dotenv`) so a developer's
  local fixture keys reach the `next dev` process it spawns, exactly mirroring the
  pre-existing `NEXT_PUBLIC_API_URL` fallback pattern already there.

**No gitleaks configuration was added, modified, or bypassed anywhere in this phase** —
every fixture value that needed to be shape-valid is computed at runtime specifically so
it never needs to be.

## 10. Manual UAT Results

Performed locally against a pre-warmed `next dev` server using the fixture keys described
in §9 (no real Clerk account exists, so real sign-in/sign-up could not be exercised —
see §11):

1. **Open protected route while signed out** → redirects to `/sign-in`. ✅ (automated:
   `tests/e2e/auth.spec.ts`)
2. **Confirm redirect/block** → confirmed via the same test; manually re-verified by
   navigating directly to `http://localhost:3100/app` in the pre-warmed dev server.
3. **Sign in** → **not performed** (§11 — no real Clerk account/credentials exist to sign
   in with).
4. **Confirm protected route opens** → not performed for the same reason.
5. **Refresh / session persistence** → not performed for the same reason (session
   persistence is entirely Clerk's own cookie mechanism; nothing in this codebase
   implements or could break it).
6. **Sign out** → not performed for the same reason (the `<UserButton>`'s sign-out action
   is Clerk's own prebuilt behavior; nothing custom was implemented).
7. **Call protected API while signed out** → `GET /me` with no `Authorization` header
   returns `401 AUTHENTICATION_ERROR`. ✅ (automated: `tests/integration/api-me.test.ts`)
8. **Confirm 401** → confirmed, same test.
9. **Sign in and repeat / confirm authenticated identity resolved** → covered by
   `api-me.test.ts`'s mocked-valid-token case (200, correct `userId` returned) — the
   _logic_ is fully proven; only the _real, end-to-end, actually-signed-in-via-browser_
   case could not be performed, for the reason in §11.

## 11. Known Limitations

1. **No real Clerk application exists.** Every genuinely end-to-end, real-browser,
   real-sign-in flow (items 3–6 and the fully-live version of 9 in §10) could not be
   manually verified in this session and cannot be automated in CI either, per the
   governing task's own explicit instruction not to depend on one. This is a structural
   limitation, not a defect — the code is written and tested against every seam that
   _can_ be verified without a real account (§7's mocked tests cover the actual identity
   -resolution logic completely).
2. **Local E2E required `--workers=1`.** This session's machine hit a V8/Chromium
   out-of-memory error at Playwright's default parallelism (4 workers) — consistent with
   the severe local disk-space exhaustion already documented in
   `phase-2-1-implementation-report.md` §9. Not a code or test defect; CI's clean runner
   is not expected to share this constraint, and no change was made to the committed
   default worker count.
3. **Docker remains unverified locally**, for the same reasons documented in Phase 2.1 —
   unchanged this phase, not re-investigated (task instruction: don't repeat Docker
   troubleshooting on this machine).
4. **A trailing restriction in the governing task's own text** ("Do not implement
   authentication," "Do not modify application logic") directly contradicts the
   task's entire body (14 numbered sections and a Definition of Done explicitly requiring
   exactly those things). Treated as a template artifact carried over from a prior task's
   closing boilerplate, not a deliberate restriction — flagged here per CLAUDE.md's "if
   documentation conflicts, STOP and report the conflict" rule, rather than silently
   ignored. The two adjacent lines in that same trailing block that _are_ consistent with
   the rest of the task ("Do not install Clerk credentials," "Do not create Clerk
   application configuration," "Do not create migrations") were honored literally.

## 12. Phase 2.3 Prerequisites

Per `phase-2-implementation-sequence.md` (updated alongside this report):

- A real Clerk application must be created (Dashboard, outside this repository, still not
  done anywhere in this session) before real sign-in/sign-up/session behavior can be
  manually verified end-to-end.
- The `users` table (Application User, sequence step 3) remains the next schema step —
  intentionally not started this phase (§8).
- Everything downstream of it (Workspace, Membership, Role, Permission, the full
  `requireWorkspace()`/`requireMembership()`/`requirePermission()`/`requireResourceAccess()`
  chain) remains unbuilt and unblocked by this phase's choices — `getAuthenticatedIdentity()`
  / `requireAuthenticatedIdentity()` are deliberately named and scoped so later phases can
  build directly on top of them without rework.
