"use client";

/** Catches errors thrown by the root layout itself, where the normal error.tsx can't apply. */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <div role="alert">
          <h1>Something went wrong</h1>
          <p>The application failed to load. Please try again.</p>
          <button type="button" onClick={reset}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
