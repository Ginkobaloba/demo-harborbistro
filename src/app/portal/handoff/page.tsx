"use client";

import { useEffect, useState } from "react";

/**
 * Client-side handoff page (chunk 4b).
 *
 * The Portal redirects logged-in users to:
 *   https://harborbistro.example/portal/handoff#portal_token=<JWT>
 *
 * We read the token from window.location.hash (which never reaches an
 * HTTP server log), scrub it from the URL, and POST it to
 * /api/auth/portal-handoff which verifies and mints our session.
 *
 * Plain Harbor Bistro brand styling. Paradigm colors stay in the
 * banner only.
 */
export default function PortalHandoffPage() {
  const [status, setStatus] = useState<"working" | "error">("working");
  const [message, setMessage] = useState<string>("Signing you in...");

  useEffect(() => {
    let cancelled = false;
    async function run() {
      const hash = window.location.hash.replace(/^#/, "");
      const params = new URLSearchParams(hash);
      const token = params.get("portal_token");

      // Scrub the fragment immediately so the token does not linger in
      // history, regardless of what happens next.
      try {
        history.replaceState(null, "", window.location.pathname);
      } catch {
        // older browsers, fine
      }

      if (!token) {
        if (!cancelled) {
          setStatus("error");
          setMessage(
            "No Portal token found. Please launch Harbor Bistro from your Paradigm Portal dashboard.",
          );
        }
        return;
      }

      try {
        const res = await fetch("/api/auth/portal-handoff", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        if (!res.ok) {
          if (!cancelled) {
            setStatus("error");
            setMessage(
              "We could not verify your Portal session. Please relaunch from the Portal.",
            );
          }
          return;
        }

        const data = (await res.json()) as { redirect?: string };
        const target = data.redirect && data.redirect.startsWith("/")
          ? data.redirect
          : "/order";
        if (!cancelled) {
          window.location.replace(target);
        }
      } catch {
        if (!cancelled) {
          setStatus("error");
          setMessage(
            "Network problem during sign-in. Please try the Portal launch again.",
          );
        }
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 py-16 text-center">
      <h1 className="font-serif text-3xl text-harbor-teal">Harbor Bistro</h1>
      <p
        className={`mt-6 text-base ${
          status === "error" ? "text-red-700" : "text-harbor-ink-soft"
        }`}
        role="status"
        aria-live="polite"
      >
        {message}
      </p>
    </main>
  );
}
