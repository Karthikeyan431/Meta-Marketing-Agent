# Phase 2.1 — Next.js Compatibility Upgrade & Clerk Integration Readiness

**Document ID:** IDENT-016 | Version 1.0 | Status: Complete | Phase: 2.1 (Implementation)

Governed by the "Claude Code — Phase 2.1" task, executed under the Phase 2A-approved
architecture (commit `a06b3fb4d973cf2ce8df264c7ff5ab2c4f513817`). This is an engineering
readiness slice only — no authentication, authorization, workspace, or RBAC code was
implemented. See §11/§12 for the exact boundary of what changed.

## 1. Baseline Versions

Recorded from actual package files and the resolved lockfile — **not** assumed from prior
documentation, per this task's explicit Step 1 instruction. A real discrepancy was found
and is called out below.

| Component            | Declared (package.json, before) | Actually resolved (pnpm-lock.yaml, before) |
| -------------------- | ------------------------------- | ------------------------------------------ |
| Next.js (`apps/web`) | `^15.1.4`                       | **`15.5.25`**                              |
| React                | `^19.0.0`                       | `19.2.8`                                   |
| React DOM            | `^19.0.0`                       | `19.2.8`                                   |
| `@types/react`       | `^19.0.2`                       | `19.2.18`                                  |
| Node.js (engine)     | `>=22.0.0`                      | `v24.15.0` (this session's runtime)        |
| pnpm                 | `10.29.2` (pinned)              | `10.29.2`                                  |
| TypeScript           | `^5.7.3`                        | `5.9.3`                                    |

**Key finding:** the Phase 2A architecture documents (`clerk-integration.md` finding #1,
ADR-015) correctly identified `apps/web/package.json`'s **declared** floor (`^15.1.4`) as
below `@clerk/nextjs`'s minimum peer requirement — but the lockfile had already resolved
Next.js to **15.5.25** at some prior `pnpm install` (a caret range floats to the newest
matching version at resolution time). The actually-running Next.js binary was therefore
already Clerk-compatible before this phase touched anything; the declared specifier was
simply stale/misleading relative to reality. This is exactly the kind of package-file vs.
documentation disagreement Step 1 asked to catch, not assume away.

## 2. Upgrades

| Change                         | Previous                               | New                                   | Reason                                                                                                                                                                                                                                                                |
| ------------------------------ | -------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/package.json` `next` | `^15.1.4` (declared; resolved 15.5.25) | `^15.5.9` (resolved: still `15.5.25`) | Aligns the **declared** floor with the Phase 2A-approved target (ADR-015) and with `@clerk/nextjs`'s live peer range, per this task's Step 2. No functional runtime change — the same `15.5.25` binary was already installed; only the declared intent was corrected. |
| Lockfile (`pnpm-lock.yaml`)    | `next` specifier `^15.1.4`             | `next` specifier `^15.5.9`            | Regenerated via `pnpm install` (no manual edits) after the `package.json` change.                                                                                                                                                                                     |

**No React/React-DOM/TypeScript version change was made** — both were already within
`@clerk/nextjs@7.9.1`'s live peer range (verified §3) and the task scoped this upgrade to
Next.js only.

**No upgrade to Next.js 16 was made or considered** — `latest` on npm is `16.3.4`, but the
task's Hard Restriction and the Phase 2A architecture both require staying on the 15.x
line; the npm `backport` dist-tag (`15.5.25`) confirms 15.5.25 is the current latest
15.x release, so no newer 15.x exists to move to.

## 3. Clerk Compatibility

Live-verified against the npm registry on this task's execution date (re-verified, not
reused from the Phase 2A research pass, per Step 4):

| Item                                             | Result                                                                                                                                                                                                        |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@clerk/nextjs` latest version                   | `7.9.1` — **unchanged** since the Phase 2A verification pass; no newer version has been published, so no "safer newer version" decision was needed.                                                           |
| Peer requirement: `next`                         | `^15.2.8 \|\| ^15.3.8 \|\| ^15.4.10 \|\| ^15.5.9 \|\| ^15.6.0-0 \|\| ^16.0.10 \|\| ^16.1.0-0` — our resolved `15.5.25` satisfies this (specifically `^15.5.9`, which covers `>=15.5.9 <16.0.0`).              |
| Peer requirement: `react`/`react-dom`            | `^18.0.0 \|\| ~19.0.3 \|\| ~19.1.4 \|\| ~19.2.3 \|\| ~19.3.0-0` — our resolved `19.2.8` satisfies `~19.2.3` (`>=19.2.3 <19.3.0`).                                                                             |
| **Installed version**                            | `@clerk/nextjs@^7.9.1` (resolved `7.9.1`) — the exact, already-verified-latest version, not blindly upgraded past what was checked.                                                                           |
| Unrelated Clerk packages                         | None installed directly. `@clerk/shared`, `@clerk/backend`, `@clerk/react`, `@clerk/types` etc. were pulled in as `@clerk/nextjs`'s own transitive dependencies (normal for any SDK) — not separately chosen. |
| Duplicate auth/session libraries                 | None added. No other authentication or session-management package exists in the repository.                                                                                                                   |
| `pnpm audit --audit-level=high` after installing | **No known vulnerabilities found.**                                                                                                                                                                           |

### Environment requirements

Added to `.env.example` as **placeholders only** (no real values, per Hard Restrictions):

```text
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=replace-with-real-clerk-publishable-key
CLERK_SECRET_KEY=replace-with-real-clerk-secret-key
CLERK_WEBHOOK_SIGNING_SECRET=replace-with-real-clerk-webhook-signing-secret
```

The first two are required for `@clerk/nextjs` to initialize at all (per
`clerk-integration.md` finding #10); the webhook secret is reserved (unused this phase) so
the variable name is settled ahead of `identity-sync.md`'s webhook design. No Clerk
application was created; no Clerk Dashboard configuration was touched.

## 4. Security

- **Secret scan:** `gitleaks` is not available as a local CLI in this execution
  environment; the repository's CI (`gitleaks/gitleaks-action@v2`, `.github/workflows/ci.yml`)
  runs it on every push — treated as the authoritative scan, consistent with how this
  project has verified secret-scan results in prior phases.
  **A real CI failure occurred and was diagnosed and fixed, not suppressed:** the first
  push of this phase's changes failed CI's "Secret scan" step — gitleaks' `stripe-access-token`
  rule flagged the two Clerk publishable/secret key placeholders originally added to
  `.env.example` and this report. Root cause: those placeholders were written in Clerk's
  own real key-prefix shape (the same two-letter-plus-underscore prefix convention Stripe
  also uses for its keys), so a placeholder in that shape is indistinguishable, by pattern,
  from a real Stripe key — this is gitleaks correctly matching the _shape_ of the string,
  not a real secret being present (no Clerk application or credential exists anywhere in
  this session). **Fix:** the placeholders were reworded to a plain, descriptive
  non-key-shaped form (`replace-with-real-clerk-publishable-key` and sibling names — see
  §3's code block for the exact current values) that reads unambiguously as a placeholder
  and no longer matches any credential-shaped regex, in both `.env.example` and this
  report (this paragraph included, deliberately, since a prior revision of this very
  paragraph quoting the old key-shaped placeholder literally was itself re-flagged by
  gitleaks on the next push — worth knowing if this incident is ever revisited: the fix
  must remove the pattern from every file, including narrative documentation, not just the
  `.env.example` source). No gitleaks configuration, allowlist, or suppression rule was
  added or touched — the fix removes the false-positive trigger at its source instead of
  silencing the scanner. Re-verified: manual review of every file this
  phase touched (`apps/web/package.json`, `pnpm-lock.yaml`, `.env.example`, this report)
  confirms no secrets, tokens, or credentials — only clearly-worded placeholder strings.
- **Middleware boundary:** No `middleware.ts` (or `proxy.ts`) file exists in the repository
  before or after this phase. None was created. §7 below documents, in writing only, where
  Clerk's session middleware will eventually sit — no route protection or authorization
  logic was added anywhere.
- **Authorization boundary:** Unchanged. No `requireAuth()`/`requireWorkspace()`/etc.
  primitive was implemented. No code path anywhere reads a workspace ID, user ID, or role
  from a client-supplied value and treats it as authoritative — this phase added no new
  code paths that read request data at all.
- **Credential exposure review:**
  - No real Clerk secret, publishable key, or webhook signing secret was ever entered
    anywhere in this session — only the literal placeholder strings shown in §3.
  - `.env` (the real, gitignored local file) was populated from `.env.example` locally to
    enable integration testing against local Postgres/Redis; it was never staged, committed,
    or displayed with real secrets (it also only contains local-dev placeholder-equivalent
    values, matching `.env.example`'s existing pattern — no Clerk keys were put in the local
    `.env` either, since Clerk is not exercised by any code yet).
  - `apps/web/Dockerfile` was not modified and does not embed any credential — it only runs
    `pnpm install --frozen-lockfile` and `pnpm build` inside the image.
  - No CI workflow file was modified; no log output from this session contains a real
    secret (only placeholder values and version/dependency metadata were printed).
- **Dependency vulnerability review:** `pnpm audit --audit-level=high` after installing
  `@clerk/nextjs` reports no known vulnerabilities (§3).

None of the specific anti-patterns this task's Step 9 asked to check for were introduced:
client-trusted workspace/user IDs, Clerk roles used as application roles, middleware-only
authorization, frontend-state-only authorization, unauthenticated server actions, secrets
committed to git, credentials in Docker layers/CI logs, or unsafe environment variable
exposure. None of these exist in the repository before or after this phase — no code was
written that could introduce them.

## 5. Verification

| Check                | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Install              | **PASS** — `pnpm install` completed cleanly both after the Next.js specifier bump and after the Clerk install; lockfile regenerated by pnpm, never hand-edited.                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Lint                 | **PASS** — `pnpm run lint` (`eslint .`), clean, before and after the Clerk install.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Format               | **PASS** — `pnpm run format` (`prettier --check .`), clean.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Typecheck            | **PASS** — `pnpm run typecheck` across all 15 workspace projects with `typecheck` scripts (including `apps/web`), clean, before and after the Clerk install.                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Unit                 | **PASS** — `pnpm run test:unit`, 5 files / 14 tests, all passing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Integration          | **Locally: FAIL — environment, not code.** Could not complete locally; root-caused to this machine's Docker Desktop backend being unresponsive to CLI calls this session (`docker info`/`docker ps` never returned output after 15+ minutes), leaving the mapped ports (5433/6380) TCP-reachable but not actually backed by a responding Postgres/Redis instance. **On CI (run 33967395383, Ubuntu, real ephemeral Postgres/Redis services): PASS.** Confirms the local failure was this machine's environment, not the Next.js/Clerk change — these tests exercise `apps/api`/`packages/queue` only. |
| API build            | **PASS** — `pnpm --filter @ai-marketing-manager/api run build` (`tsc`), clean.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Worker builds        | **PASS** — all 6 workers (`sync`, `insights`, `optimization`, `report`, `webhook`, `maintenance`) build cleanly via `tsc`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Web production build | **Locally: PARTIAL — environment, not code.** `next build` compiles, type-checks, and statically generates all 4 pages successfully using the correct `15.5.25` binary; only the final Windows-only "collecting build traces" step fails with `EPERM` on symlink creation (Windows requires Developer Mode or Administrator privileges for this). **On CI (run 33967395383, Ubuntu): PASS** — confirms this is purely a Windows-host limitation, not present in the Linux environment this project actually deploys from.                                                                             |
| Docker               | **NOT VERIFIED — environment (see §8).** Docker Desktop's CLI/API did not respond during this session despite its background processes running; a build attempt against `apps/web/Dockerfile` produced zero output after 15+ minutes and was stopped. The repository's CI does not currently include a Docker build step either (confirmed by reading `.github/workflows/ci.yml`) — this is a pre-existing gap in the pipeline, not something introduced or resolved by this phase.                                                                                                                   |
| E2E                  | **Locally: PASS** (3/3, once the dev server was pre-warmed — see §9). **On CI (run 33967395383): PASS.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Secret scan          | **First two CI pushes: FAIL (real finding, diagnosed and fixed each time — see §4).** Gitleaks' `stripe-access-token` rule matched the original key-shaped Clerk env placeholders (Clerk and Stripe share the same key-prefix convention), then re-matched this document's own first attempt at describing that placeholder literally. Fixed by rewording the placeholders to a non-credential-shaped form in `.env.example` and removing the literal old value from this document's own prose; re-pushed for re-verification (§6/§10 of the Final Report has the resulting run).                     |

## 6. CI

Pushed as commit (see §7/§10 of the Final Report for the exact SHA) to `origin/main`.
GitHub Actions workflow `.github/workflows/ci.yml` runs install → lint → format → typecheck
→ migrate → unit → integration → build (root + web) → Playwright install → E2E → secret
scan → dependency audit, using ephemeral `postgres:17-alpine`/`redis:7-alpine` service
containers — the same checks this report could only partially complete locally, run in a
clean Ubuntu environment unaffected by this session's local Windows/Docker Desktop issues.
**CI's result is the authoritative verification for integration tests, the web production
build, and the secret scan** for this change; see the Final Report for the actual run
outcome.

## 7. Middleware Integration Boundary (Step 7 — documentation only)

No `middleware.ts` exists in this repository. None was created in this phase. When Clerk
authentication is actually implemented (a later Phase 2 slice, per
`phase-2-implementation-sequence.md` step 4), a root `apps/web/middleware.ts` (Next.js
15.x filename — **not** `proxy.ts`, which is a Next.js 16-only concept per
`clerk-integration.md` finding #2) will call `clerkMiddleware()` to establish `req.auth`
(the authenticated Clerk identity/session context) for downstream Server Components/Route
Handlers.

**This middleware will never itself authorize anything.** Per Clerk's own current
documentation (`clerk-integration.md` finding #3, re-affirmed, not re-verified live this
phase since no Clerk API surface changed) and this project's approved architecture, the
middleware's sole responsibility will be establishing _who is asking_ — every _what may
they do_ decision happens later, at the resource/data-access layer, via the approved
`requireAuth()/requireWorkspace()/requireMembership()/requirePermission()/requireResourceAccess()`
chain (`docs/identity/authorization.md`). This phase implements none of those primitives —
they remain approved-but-unbuilt, exactly as `phase-2-implementation-sequence.md` step 8
schedules them (after the database schema, `User`, `Workspace`, and `Membership` steps).

## 8. Authentication Integration Boundary (Step 8)

```text
Browser
  ↓
Next.js (apps/web)
  ↓
Clerk Session            — established by clerkMiddleware() (not yet implemented)
  ↓
Authenticated User       — Clerk userId, valid session (requireAuth(), not yet implemented)
  ↓
Application User         — our users row, keyed by clerk_user_id (schema not yet migrated)
  ↓
Workspace                — the tenant boundary (requireWorkspace(), not yet implemented)
  ↓
Membership                — proves this user belongs to this workspace (requireMembership())
  ↓
Role                      — OWNER/ADMIN/MANAGER/ANALYST/VIEWER (requirePermission())
  ↓
Permission                — workspace.read, campaign.update, budget.approve, ...
  ↓
Resource Authorization    — requireResourceAccess(), WHERE id AND workspace_id
```

**`Clerk authentication ≠ application authorization.`** Everything from "Authenticated
User" downward is owned entirely by this project's own PostgreSQL database, never by
Clerk — Clerk Organization membership/roles (if used at all, per the approved 1:1
Organization↔Workspace mapping) are never themselves an authorization fact. This restates,
without changing, `docs/identity/identity-architecture.md` §1's chain and
`docs/identity/authorization.md`'s primitive contracts — nothing in this phase adds,
removes, or reinterprets a link in that chain. **None of the boxes below "Next.js" are
implemented by this phase** — this diagram exists so Phase 2.2+ implements against an
explicit, agreed boundary rather than an implicit one.

## 9. Environment/Tooling Observations Encountered This Session

Recorded transparently, separated from code defects per this task's Failure Handling
section — none of these required or received a code change:

1. **Docker Desktop unresponsive.** `docker info`/`docker ps`/`docker build` all hung
   indefinitely (15+ minutes, zero output) despite Docker Desktop's own background
   processes (`com.docker.backend`, `Docker Desktop`, `docker-desktop` WSL distro reporting
   "Running") being present. This blocked local Docker build verification entirely. Not
   caused by, or fixable via, any change to this repository.
2. **Local Postgres/Redis TCP-reachable but not responsive.** Ports 5433/6380 (this
   project's documented local dev mappings) accepted raw TCP connections but did not
   respond to actual Postgres/Redis protocol traffic within test timeouts — consistent
   with the project's own previously-documented Windows/WSL2 relay port-squatting quirk
   (see `infrastructure/docker-compose.yml`'s existing comment about a similar issue on
   port 6379), likely the same underlying Docker Desktop unresponsiveness from item 1.
   Integration tests exercise `apps/api`/`packages/queue` exclusively — this phase's actual
   change (Next.js version + Clerk install in `apps/web`) cannot have caused it.
3. **Windows-only `next build` trace-copy failure.** The Next.js standalone output's final
   "collecting build traces" step uses filesystem symlinks to deduplicate `node_modules`
   into the traced output; Windows refuses symlink creation without Developer Mode or
   Administrator privileges, producing `EPERM`. This is a documented Next.js/Windows
   limitation, unrelated to this phase's version change (the same `15.5.25` binary was
   already resolved before this phase touched anything) and does not occur in the Linux
   containers this project's actual Docker/CI builds run in.
4. **Playwright's default 60s `webServer` startup timeout was insufficient for a cold
   first-compile** of `next dev` on this machine (observed ~19.5s to "Ready" + ~16.6s to
   compile the first page request = ~36s, but the _first_ attempt exceeded 60s combined
   with process/port cleanup overhead from a stale process left on port 3100 by an earlier
   attempt). Resolved for this session by pre-warming the dev server before invoking
   Playwright; not a code change, and not evidence of an application defect — the app
   itself responded correctly (HTTP 200, correct HTML) once warm. Worth the owner knowing
   this exists as a local machine characteristic; no `playwright.config.ts` change was made
   since Step 3 forbids weakening/bypassing checks and the underlying timeout is
   appropriate for CI's environment (which has passed this exact E2E suite previously).

## 10. Phase 2.2 Prerequisites

Per `phase-2-implementation-sequence.md`, Phase 2.1 completes step 1 (Next.js upgrade) and
step 2 (Clerk installation/configuration readiness — package installed, environment
placeholders declared). Before Phase 2.2 (Application User/Workspace/Membership schema and
beyond) begins:

- A real Clerk application must be created (Dashboard, outside this repository) and its
  actual `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`/`CLERK_SECRET_KEY` values placed in a
  developer's real `.env` — never committed.
- The exact `organizationMembership.created`-equivalent event name should be confirmed
  against that real application's Dashboard Event Catalog before any webhook handler is
  written (OD-09, still open — unaffected by this phase).
- This session's local Docker/Postgres/Redis unresponsiveness (§9) should be resolved (or
  worked around, e.g. via a fresh Docker Desktop restart) before local integration-test-
  driven development of the schema/membership work in Phase 2.2, since that work will lean
  heavily on the same local Postgres instance.
