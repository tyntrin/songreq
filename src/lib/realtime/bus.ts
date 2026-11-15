import { EventEmitter } from "node:events";

export type BusEvent = { type: "request.created" | "request.updated" | "items.seen" };
export type BusHandler = (event: BusEvent) => void;

export const performerChannel = (id: string) => `performer:${id}`;
export const deviceChannel = (performerId: string, deviceId: string) =>
  `device:${performerId}:${deviceId}`;

function createBus() {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(0);
  return {
    publish(channel: string, event: BusEvent): void {
      // Copy so handlers that unsubscribe mid-publish are safe; isolate handler failures.
      for (const handler of emitter.listeners(channel) as BusHandler[]) {
        try {
          handler(event);
        } catch (e) {
          console.error("[bus] handler error", e);
        }
      }
    },
    subscribe(channel: string, handler: BusHandler): () => void {
      emitter.on(channel, handler);
      return () => {
        emitter.off(channel, handler);
      };
    },
    listenerCount(channel: string): number {
      return emitter.listenerCount(channel);
    },
  };
}

export type Bus = ReturnType<typeof createBus>;

// One instance per process, shared across Next dev HMR reloads and route bundles.
const g = globalThis as unknown as { __songRequestBus?: Bus };
export const bus: Bus = (g.__songRequestBus ??= createBus());
