// Realtime abstraction placeholder
export class RealtimeProvider {
  publish(channel, payload){ /* noop */ }
  subscribe(channel, handler){ return () => {}; }
}
export const realtime = new RealtimeProvider();
