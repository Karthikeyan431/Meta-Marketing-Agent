import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ClerkProvider, Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Marketing Manager",
  description: "Manage Meta advertising campaigns through a chat-first interface.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/*
          ClerkProvider wraps the app inside <body>, never wrapping <html>
          (clerk-integration.md finding #10). It establishes the client-side auth context
          only — it never itself decides what an authenticated user may access.
        */}
        <ClerkProvider signInUrl="/sign-in" signUpUrl="/sign-up">
          <div className="app-shell">
            <a className="skip-link" href="#main-content">
              Skip to main content
            </a>
            <header>
              <nav aria-label="Primary">
                {/* Workspace shell navigation lands in a later phase. */}
                <Show when="signed-out">
                  <SignInButton />
                  <SignUpButton />
                </Show>
                <Show when="signed-in">
                  <UserButton />
                </Show>
              </nav>
            </header>
            <main id="main-content" className="app-main" tabIndex={-1}>
              {children}
            </main>
          </div>
        </ClerkProvider>
      </body>
    </html>
  );
}
