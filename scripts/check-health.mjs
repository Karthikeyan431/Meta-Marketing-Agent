#!/usr/bin/env node
/**
 * Polls a set of health/readiness URLs until every one returns 2xx, or a timeout elapses.
 * Used for local verification and can be wired into CI as a post-deploy smoke check later.
 *
 * Usage: node scripts/check-health.mjs http://localhost:4000/health http://localhost:4000/ready
 */

const urls = process.argv.slice(2);
const TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 1_000;

if (urls.length === 0) {
  console.error("Usage: node scripts/check-health.mjs <url> [url...]");
  process.exit(2);
}

async function checkOnce(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitFor(url) {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await checkOnce(url)) {
      console.log(`OK   ${url}`);
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  console.error(`FAIL ${url} (timed out after ${TIMEOUT_MS}ms)`);
  return false;
}

const results = await Promise.all(urls.map(waitFor));
process.exit(results.every(Boolean) ? 0 : 1);
