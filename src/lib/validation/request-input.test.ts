import { describe, expect, it } from "vitest";
import { parseRequestInput } from "./request-input";
import { ValidationError } from "./text";

const base = {
  clientRequestId: "3f2b8c1e-5a4d-4e6f-8a9b-1c2d3e4f5a6b",
  songIds: ["a"],
  name: null,
  message: null,
  tipAmount: 0,
};

function fieldOf(body: unknown): string | undefined {
  try {
    parseRequestInput(body);
  } catch (e) {
    expect(e).toBeInstanceOf(ValidationError);
    return (e as ValidationError).field;
  }
  return undefined;
}

describe("parseRequestInput", () => {
  it("accepts a valid body", () => {
    expect(parseRequestInput(base)).toEqual(base);
  });
  it("rejects 41-char name", () => {
    expect(fieldOf({ ...base, name: "x".repeat(41) })).toBe("name");
  });
  it("accepts 40-char name", () => {
    expect(parseRequestInput({ ...base, name: "x".repeat(40) }).name).toHaveLength(40);
  });
  it("rejects 141-char message", () => {
    expect(fieldOf({ ...base, message: "x".repeat(141) })).toBe("message");
  });
  it("cleans control chars and trims", () => {
    expect(parseRequestInput({ ...base, name: "  \u0007hi " }).name).toBe("hi");
  });
  it("empty name becomes null; missing name ok", () => {
    expect(parseRequestInput({ ...base, name: "  " }).name).toBeNull();
    const { name: _n, ...rest } = base;
    void _n;
    expect(parseRequestInput(rest).name).toBeNull();
  });
  it("rejects 11 songIds", () => {
    const songIds = Array.from({ length: 11 }, (_, i) => `s${i}`);
    expect(fieldOf({ ...base, songIds })).toBe("songIds");
  });
  it("rejects duplicates and empty list", () => {
    expect(fieldOf({ ...base, songIds: ["a", "a"] })).toBe("songIds");
    expect(fieldOf({ ...base, songIds: [] })).toBe("songIds");
  });
  it("rejects bad tips", () => {
    for (const tipAmount of [50.5, -1, 10001]) {
      expect(fieldOf({ ...base, tipAmount })).toBe("tipAmount");
    }
  });
  it("accepts tip 0 and 10000", () => {
    expect(parseRequestInput({ ...base, tipAmount: 0 }).tipAmount).toBe(0);
    expect(parseRequestInput({ ...base, tipAmount: 10000 }).tipAmount).toBe(10000);
  });
  it("rejects bad clientRequestId and non-object", () => {
    expect(fieldOf({ ...base, clientRequestId: "nope" })).toBe("clientRequestId");
    expect(fieldOf(null)).toBeDefined();
  });
});
