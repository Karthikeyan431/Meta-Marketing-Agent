import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Marketing Manager",
  description: "Manage Meta advertising campaigns through a chat-first interface.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <a className="skip-link" href="#main-content">
            Skip to main content
          </a>
          <header>
            <nav aria-label="Primary">{/* Workspace shell navigation lands in Phase 6. */}</nav>
          </header>
          <main id="main-content" className="app-main" tabIndex={-1}>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
