"use client";

import { useEffect } from "react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Client-side error boundaries can't reach the server logger directly; this is a
    // deliberate console.error so the failure is at least visible during development.
    // Structured client-error reporting to the API is a later-phase observability task.
    console.error("Unhandled route error:", error);
  }, [error]);

  return (
    <div role="alert">
      <h1>Something went wrong</h1>
      <p>An unexpected error occurred while loading this page. You can try again.</p>
      <button type="button" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
