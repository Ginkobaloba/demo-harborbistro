import { describe, it, expect } from "vitest";
import { readJsonBody, textField } from "./request-body";

function streamed(chunks: string[], headers: Record<string, string> = {}): Request {
  const enc = new TextEncoder();
  let pulled = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pulled < chunks.length) controller.enqueue(enc.encode(chunks[pulled++]));
      else controller.close();
    },
  });
  return new Request("http://localhost/x", {
    method: "POST",
    headers,
    body,
    // Required by undici for a stream body; mirrors a chunked upload.
    duplex: "half",
  } as RequestInit);
}

describe("readJsonBody", () => {
  it("parses a body under the cap", async () => {
    const r = await readJsonBody(streamed(['{"a":', '"b"}']), 100);
    expect(r).toEqual({ ok: true, body: { a: "b" } });
  });

  it("refuses a chunked body (no Content-Length) once it passes the cap", async () => {
    const chunks = Array.from({ length: 100 }, () => "x".repeat(1000));
    const r = await readJsonBody(streamed(chunks), 4096);
    expect(r).toMatchObject({ ok: false, status: 413 });
  });

  it("refuses up front when the declared Content-Length is over the cap", async () => {
    const r = await readJsonBody(streamed(["{}"], { "content-length": "999999" }), 1024);
    expect(r).toMatchObject({ ok: false, status: 413 });
  });

  it("counts bytes, not characters, against the cap", async () => {
    // 10 characters of a 3-byte UTF-8 symbol is 30 bytes plus 2 quotes.
    const body = JSON.stringify("€".repeat(10));
    expect((await readJsonBody(streamed([body]), 32)).ok).toBe(true);
    expect(await readJsonBody(streamed([body]), 31)).toMatchObject({ ok: false, status: 413 });
  });

  it("answers 400 for invalid JSON and for a missing body", async () => {
    expect(await readJsonBody(streamed(["{nope"]), 100)).toMatchObject({ ok: false, status: 400 });
    expect(await readJsonBody(new Request("http://localhost/x", { method: "POST" }), 100)).toMatchObject({
      ok: false,
      status: 400,
    });
  });
});

describe("textField", () => {
  it("treats absent and null as empty, trims, and enforces the max", () => {
    expect(textField(undefined, "Name", 3)).toEqual({ ok: true, value: "" });
    expect(textField(null, "Name", 3)).toEqual({ ok: true, value: "" });
    expect(textField("  abc  ", "Name", 3)).toEqual({ ok: true, value: "abc" });
    expect(textField("abcd", "Name", 3)).toEqual({ ok: false, error: "Name must be at most 3 characters" });
  });

  it("refuses non-string values", () => {
    expect(textField(42, "Phone", 10)).toEqual({ ok: false, error: "Phone must be text" });
    expect(textField(["a"], "Phone", 10).ok).toBe(false);
  });
});
