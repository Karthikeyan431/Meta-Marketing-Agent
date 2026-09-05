import { z } from "zod";

/**
 * Phase 2.2 scope only: the authenticated Clerk identity, nothing else. No workspace,
 * membership, role, or permission fields exist yet — those arrive with the application
 * User/Workspace/Membership schema in a later Phase 2 slice.
 */
export const meResponseSchema = z.object({
  userId: z.string(),
});
export type MeResponse = z.infer<typeof meResponseSchema>;
