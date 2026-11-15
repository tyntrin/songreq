import { describe, expect, it, vi } from "vitest";
import { bus, deviceChannel, performerChannel, type BusEvent } from "./bus";

describe("bus", () => {
  it("channel names", () => {
    expect(performerChannel("p")).toBe("performer:p");
    expect(deviceChannel("p", "d")).toBe("device:p:d");
  });
  it("delivers to subscribers and unsubscribes", () => {
    const got: BusEvent[] = [];
    const off = bus.subscribe("c1", (e) => got.push(e));
    bus.publish("c1", { type: "request.created" });
    off();
    bus.publish("c1", { type: "items.seen" });
    expect(got).toEqual([{ type: "request.created" }]);
    expect(bus.listenerCount("c1")).toBe(0);
  });
  it("handler errors do not break publish", () => {
    const got: BusEvent[] = [];
    const a = bus.subscribe("c2", () => {
      throw new Error("boom");
    });
    const b = bus.subscribe("c2", (e) => got.push(e));
    expect(() => bus.publish("c2", { type: "request.updated" })).not.toThrow();
    expect(got).toHaveLength(1);
    a();
    b();
  });
  it("is a shared singleton across module instances", async () => {
    const mod = (vi.resetModules(), await import("./bus"));
    expect(mod.bus).toBe(bus);
  });
});
