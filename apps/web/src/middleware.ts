import { clerkMiddleware } from "@clerk/nextjs/server";

/**
 * Establishes the Clerk session context for every request — authentication only, per
 * docs/identity/clerk-integration.md finding #3 ("Middleware is not the best place to
 * protect routes") and docs/identity/authorization.md §1. This middleware never decides
 * what an authenticated user may access; that happens per-route/per-resource
 * (see apps/web/src/app/app/page.tsx and apps/api/src/plugins/auth.ts).
 *
 * Next.js 15.x uses `middleware.ts` (not `proxy.ts`, which is a Next.js 16-only filename —
 * clerk-integration.md finding #2).
 */
export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next.js internals and static assets, unless referenced in search params.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes.
    "/(api|trpc)(.*)",
  ],
};
