import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { publicOrigin } from "./origin";

function req(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://0.0.0.0:3000/api/checkout", { headers });
}

const NEW = "https://harborbistro.paradigm.codes";
const OLD = "https://harborbistro.projectnexuscode.org";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("publicOrigin", () => {
  it("keeps the single-value behaviour: the env origin, trailing slash dropped", () => {
    vi.stubEnv("PUBLIC_BASE_URL", `${OLD}/`);
    expect(publicOrigin(req({ host: "harborbistro.paradigm.codes" }))).toBe(OLD);
  });

  it("picks the listed origin that matches the request host (both names live during a move)", () => {
    vi.stubEnv("PUBLIC_BASE_URL", `${NEW},${OLD}`);
    expect(publicOrigin(req({ host: "harborbistro.projectnexuscode.org" }))).toBe(OLD);
    expect(publicOrigin(req({ host: "harborbistro.paradigm.codes" }))).toBe(NEW);
    expect(
      publicOrigin(req({ "x-forwarded-host": "HarborBistro.Paradigm.Codes", host: "0.0.0.0:3000" })),
    ).toBe(NEW);
  });

  it("falls back to the FIRST listed origin for a host that is not listed", () => {
    vi.stubEnv("PUBLIC_BASE_URL", ` ${NEW} , ${OLD} `);
    expect(publicOrigin(req({ host: "evil.example" }))).toBe(NEW);
    expect(publicOrigin(req())).toBe(NEW);
  });

  it("skips unparseable entries rather than returning them", () => {
    vi.stubEnv("PUBLIC_BASE_URL", `not a url,${NEW}`);
    expect(publicOrigin(req({ host: "evil.example" }))).toBe(NEW);
  });

  it("uses the forwarded host when no env is set (unchanged)", () => {
    vi.stubEnv("PUBLIC_BASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(
      publicOrigin(req({ host: "harborbistro.paradigm.codes", "x-forwarded-proto": "https" })),
    ).toBe(NEW);
  });
});
