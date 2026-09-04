import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Produces a minimal, self-contained server bundle for the Docker runtime image
  // (docs/ai-marketing-manager-gate-10-devops-docs/docs/11-devops/CONTAINERIZATION.md).
  output: "standalone",
  // Internal workspace packages ship TypeScript source directly (no separate build step
  // for foundation-phase packages — see docs/implementation/architecture-decisions.md),
  // so Next must transpile them itself rather than assuming pre-built JS.
  transpilePackages: [
    "@ai-marketing-manager/ui",
    "@ai-marketing-manager/contracts",
    "@ai-marketing-manager/config",
  ],
  // The transpiled packages above use `.js`-suffixed relative imports (e.g. `./env.js`
  // resolving to `./env.ts`) — required by their own NodeNext-mode consumers (apps/api,
  // workers/*). Webpack doesn't apply that TS-specific extension mapping by default when
  // bundling a transpiled package, so it needs to be told explicitly.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
