import { EventEmitter } from "events";

class NotePubSub extends EventEmitter {
  constructor() {
    super();
    // Increase limit in case of many connections
    this.setMaxListeners(1000);
  }

  publish(docId: string, data: unknown) {
    this.emit(`op:${docId}`, data);
  }

  subscribe(docId: string, callback: (data: unknown) => void) {
    const eventName = `op:${docId}`;
    this.on(eventName, callback);
    return () => this.off(eventName, callback);
  }
}

// Singleton instance
export const notePubSub = new NotePubSub();
