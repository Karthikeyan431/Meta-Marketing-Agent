import type { PermissionKey } from "../rbac-catalog.js";
import { SystemActorNotProvisionedError } from "./errors.js";

/**
 * The authorization-context shape for a system-triggered action — e.g. a future autonomous
 * optimization run or a scheduled guardrail (`AUTONOMOUS_OPTIMIZATION.md`'s Scheduler-
 * initiated pipeline). Ratifies OD-2.4A-01 (approved 2026-09-10, see
 * `docs/identity/phase-2-4a-decisions.md`): a hybrid of that decision's Option 2 (a pure
 * system-level actor with its own fixed, narrow, explicitly-provisioned permission set,
 * distinct from any human's role) and Option 1 (an accountability chain back to the human
 * who configured the triggering rule).
 *
 * No code in this codebase constructs or consumes a `SystemActorContext` yet — no
 * autonomous/scheduled mutation pipeline exists (Phase 2.4 scope). This type exists so
 * whichever future phase builds one has a ready, owner-approved contract instead of
 * re-deriving this design, per OD-2.4A-01's own stated purpose.
 */
export interface SystemActorContext {
  /** The workspace this system actor may act within — never workspace-independent for a
   *  mutating action (`worker-authorization-contract.md` §5's rule). */
  readonly workspaceId: string;
  /** A stable, descriptive identity for this system actor (e.g.
   *  "autonomous-optimization-guardrail") — recorded as `AuditEvent.actorType = SYSTEM`'s
   *  `actorId`, matching the existing WEBHOOK/RECONCILIATION descriptive-string precedent
   *  (`identity/audit.ts`). Not a human `User.id`. */
  readonly systemActorId: string;
  /** The human (`User.id`) who configured the rule this system actor executes on behalf of —
   *  the accountability chain OD-2.4A-01 requires. Recorded in the audit event's `metadata`,
   *  not `actorId`, so `actorType = SYSTEM` audit records stay distinguishable from human
   *  `actorType = USER` records while still being traceable to a human. */
  readonly configuredByUserId: string;
  /** The fixed, explicitly-provisioned permission set this system actor may exercise —
   *  never derived from `configuredByUserId`'s live role or any human's current permissions.
   *  Must be non-empty; an unprovisioned system actor has no authority, not implicit/ambient
   *  authority (fail-closed). */
  readonly grantedPermissions: readonly PermissionKey[];
}

/**
 * Fail-closed provisioning check for a `SystemActorContext` — OD-2.4A-01's "Do not bypass
 * the authorization chain" requirement. A future phase wiring a system-triggered mutation
 * through this contract must call this before deriving any authority from the context;
 * callers must not construct ad hoc, unvalidated system-actor shapes.
 */
export function assertSystemActorProvisioned(context: SystemActorContext): void {
  if (!context.workspaceId) {
    throw new SystemActorNotProvisionedError("SystemActorContext is missing workspaceId.");
  }
  if (!context.systemActorId) {
    throw new SystemActorNotProvisionedError("SystemActorContext is missing systemActorId.");
  }
  if (!context.configuredByUserId) {
    throw new SystemActorNotProvisionedError(
      "SystemActorContext is missing configuredByUserId — a system actor must remain accountable to the human who configured it.",
    );
  }
  if (context.grantedPermissions.length === 0) {
    throw new SystemActorNotProvisionedError(
      "SystemActorContext has no grantedPermissions — a system actor must be explicitly provisioned, never implicitly privileged.",
    );
  }
}
