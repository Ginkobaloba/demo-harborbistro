"use client";

/**
 * "Built by Paradigm" banner -- typed copy of the canonical React flavor at
 * cloudflare-config/banner/ParadigmBanner.jsx (contract in its README).
 * If the canonical banner changes, re-copy and rebuild.
 *
 * Placement note: the Phase 0 README suggests top of the app shell; the
 * Harbor Bistro spec requires it at the very bottom, below the demo
 * disclaimer. Spec wins here (docs/decisions.md D-002).
 */
import { useEffect, useState, type CSSProperties } from "react";

const COOKIE_NAME = "pn_banner_dismissed";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days, in seconds

const styles: Record<string, CSSProperties> = {
  banner: {
    boxSizing: "border-box",
    height: 32,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "0 40px 0 12px",
    background: "#f7f5f0",
    color: "#1f5a44",
    font: "500 13px/1 system-ui, -apple-system, 'Segoe UI', sans-serif",
    letterSpacing: "0.02em",
    position: "relative",
    width: "100%",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    zIndex: 9999,
  },
  link: {
    color: "#1f5a44",
    fontWeight: 700,
    textDecoration: "underline",
    textUnderlineOffset: 2,
  },
  close: {
    position: "absolute",
    right: 8,
    top: "50%",
    transform: "translateY(-50%)",
    width: 24,
    height: 24,
    border: "none",
    background: "transparent",
    color: "#1f5a44",
    fontSize: 18,
    lineHeight: 1,
    cursor: "pointer",
    padding: 0,
  },
};

export function ParadigmBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const dismissed = document.cookie
      .split("; ")
      .some((c) => c.startsWith(`${COOKIE_NAME}=1`));
    setVisible(!dismissed);
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    document.cookie = `${COOKIE_NAME}=1; max-age=${COOKIE_MAX_AGE}; path=/; SameSite=Lax`;
    setVisible(false);
  };

  return (
    <div role="region" aria-label="Paradigm studio CTA" style={styles.banner}>
      <span>
        {"Built by Paradigm Coding Solutions. Want one like it for your data? "}
        <a
          href="https://projectnexuscode.org/contact"
          target="_blank"
          rel="noopener noreferrer"
          style={styles.link}
        >
          Talk to us
        </a>
      </span>
      <button
        type="button"
        aria-label="Dismiss banner for 7 days"
        style={styles.close}
        onClick={dismiss}
      >
        &#215;
      </button>
    </div>
  );
}
