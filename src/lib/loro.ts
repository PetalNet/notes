import {
  Chunk,
  Effect,
  Either,
  Encoding,
  Fiber,
  Function,
  PubSub,
  Schema,
  Stream,
} from "effect";
import diff from "fast-diff";
import { LoroDoc, LoroText, type Frontiers } from "loro-crdt";
import { decryptData, encryptData } from "./crypto";
import { syncSchemaJson } from "./remote/notes.schemas.ts";
import { sync } from "./remote/sync.remote.ts";

export class LoroNoteManager {
  #noteId: string;
  #noteKey: string;
  #doc: LoroDoc;
  #text: LoroText;
  #onUpdate: (snapshot: string) => void | Promise<void>;
  #eventSource: EventSource | null = null;
  #isSyncing = false;

  #outgoingHub: PubSub.PubSub<Uint8Array>;
  #persistenceHub: PubSub.PubSub<null>;

  #persistenceFiber: Fiber.RuntimeFiber<void, void>;
  #outgoingFiber: Fiber.RuntimeFiber<void, void> | null = null;
  #incomingFiber: Fiber.RuntimeFiber<void, void> | null = null;

  constructor(
    noteId: string,
    noteKey: string,
    onUpdate?: (snapshot: string) => void | Promise<void>,
  ) {
    this.#noteId = noteId;
    this.#noteKey = noteKey;
    this.#doc = new LoroDoc();
    this.#text = this.#doc.getText("content");
    this.#onUpdate = onUpdate ?? Function.constVoid;

    // Initialize frontiers
    this.#lastFrontiers = this.#doc.frontiers();

    // 1. Init Hubs
    this.#outgoingHub = Effect.runSync(PubSub.unbounded<Uint8Array>());
    this.#persistenceHub = Effect.runSync(PubSub.unbounded<null>());

    // 2. Persistence Loop (Debounced Snapshot)
    const persistenceStream = Stream.fromPubSub(this.#persistenceHub).pipe(
      Stream.debounce("500 millis"),
      Stream.runForEach(() =>
        Effect.promise(async () => {
          const snapshot = await this.getEncryptedSnapshot();
          await this.#onUpdate(snapshot);
        }),
      ),
    );
    this.#persistenceFiber = Effect.runFork(persistenceStream);

    // Subscribe to changes
    this.#doc.subscribe((event) => {
      // Notify content listeners
      const content = this.#text.toString();
      this.#contentListeners.forEach((listener) => {
        listener(content);
      });

      // Publish persistence signal
      Effect.runSync(this.#persistenceHub.publish(null));

      // Publish local ops for sync
      if (event.by === "local") {
        const frontiers = this.#doc.frontiers();
        try {
          const update = this.#doc.export({
            mode: "shallow-snapshot",
            frontiers: this.#lastFrontiers,
          });
          this.#lastFrontiers = frontiers;
          if (update.length > 0) {
            Effect.runSync(this.#outgoingHub.publish(update));
          }
        } catch (e) {
          console.error("Error exporting update", e);
        }
      }
    });
  }

  destroy() {
    this.stopSync();
    Effect.runSync(Fiber.interrupt(this.#persistenceFiber));
  }

  #contentListeners: ((content: string) => void)[] = [];

  /**
   * Subscribe to content changes
   */
  subscribeToContent(listener: (content: string) => void) {
    this.#contentListeners.push(listener);
    // Return unsubscribe function
    return () => {
      this.#contentListeners = this.#contentListeners.filter(
        (l) => l !== listener,
      );
    };
  }

  /**
   * Initialize the manager with an encrypted snapshot
   */
  async init(encryptedSnapshot?: string) {
    if (encryptedSnapshot) {
      await this.loadEncryptedSnapshot(encryptedSnapshot);
      this.#lastFrontiers = this.#doc.frontiers();
    }
  }

  #lastFrontiers: Frontiers;

  /**
   * Start real-time sync
   */
  startSync() {
    if (this.#isSyncing) return;
    this.#isSyncing = true;

    this.#eventSource = new EventSource(`/api/sync/${this.#noteId}`);

    // 3. Incoming Loop (Remote -> Loro)
    const incomingStream = Stream.async<Uint8Array>((emit) => {
      if (this.#eventSource) {
        this.#eventSource.onmessage = (event: MessageEvent<string>): void => {
          try {
            const data = Schema.decodeSync(syncSchemaJson)(event.data);

            for (const update of data.updates) {
              const updateBytes = Encoding.decodeBase64(update).pipe(
                Either.getOrThrow,
              ) as Uint8Array<ArrayBuffer>;
              void emit(Effect.succeed(Chunk.make(updateBytes)));
            }
          } catch (error) {
            console.error("Failed to process sync message:", error);
          }
        };

        this.#eventSource.onerror = (error) => {
          console.error("SSE connection error:", error);
          this.#eventSource?.close();
          this.#isSyncing = false;
        };
      }
    }).pipe(
      Stream.runForEach((update) =>
        Effect.sync(() => {
          this.#doc.import(update);
        }),
      ),
    );
    this.#incomingFiber = Effect.runFork(incomingStream);

    // 4. Outgoing Loop (Local -> Network)
    const outgoingStream = Stream.fromPubSub(this.#outgoingHub).pipe(
      Stream.groupedWithin(100, "500 millis"),
      Stream.runForEach((chunk) =>
        Effect.promise(async () => {
          if (Chunk.isEmpty(chunk)) return;
          await this.#sendUpdates(Chunk.toReadonlyArray(chunk));
        }),
      ),
    );
    this.#outgoingFiber = Effect.runFork(outgoingStream);
  }

  /**
   * Stop real-time sync
   */
  stopSync() {
    if (this.#eventSource) {
      this.#eventSource.close();
      this.#eventSource = null;
    }
    if (this.#incomingFiber) {
      Effect.runFork(Fiber.interrupt(this.#incomingFiber));
      this.#incomingFiber = null;
    }
    if (this.#outgoingFiber) {
      Effect.runFork(Fiber.interrupt(this.#outgoingFiber));
      this.#outgoingFiber = null;
    }
    this.#isSyncing = false;
  }

  /**
   * Send update to server
   */
  async #sendUpdates(updates: readonly Uint8Array[]) {
    try {
      await sync({
        noteId: this.#noteId,
        updates: updates.map((u) => Encoding.encodeBase64(u)),
      });
    } catch (error) {
      console.error("Failed to send update:", error);
    }
  }

  /**
   * Get current text content
   */
  getContent(): string {
    return this.#text.toString();
  }

  /**
   * Update text content using diffs
   */
  updateContent(newContent: string) {
    const currentContent = this.#text.toString();
    if (currentContent === newContent) return;

    console.log("[Loro] Updating content with diff...");

    // Calculate diff
    const diffs = diff(currentContent, newContent);

    let index = 0;
    for (const [type, text] of diffs) {
      switch (type) {
        // DELETE
        case -1: {
          this.#text.delete(index, text.length);
          break;
        }

        // EQUAL
        case 0: {
          index += text.length;
          break;
        }

        // INSERT
        case 1: {
          this.#text.insert(index, text);
          index += text.length;
          break;
        }
      }
    }

    this.commit();
  }

  /**
   * Get encrypted snapshot for storage
   */
  async getEncryptedSnapshot(): Promise<string> {
    const snapshot = this.#doc.export({
      mode: "snapshot",
    }) as Uint8Array<ArrayBuffer>;
    const encrypted = await encryptData(snapshot, this.#noteKey);
    return Encoding.encodeBase64(encrypted);
  }

  /**
   * Load from encrypted snapshot
   */
  async loadEncryptedSnapshot(encryptedSnapshot: string) {
    try {
      const encryptedBytes = Encoding.decodeBase64(encryptedSnapshot).pipe(
        Either.getOrThrow,
      ) as Uint8Array<ArrayBuffer>;
      const decrypted = await decryptData(encryptedBytes, this.#noteKey);
      this.#doc.import(decrypted);
    } catch (error) {
      console.error("Failed to load encrypted snapshot:", error);
      throw error;
    }
  }

  /**
   * Apply update from another peer
   */
  applyUpdate(update: Uint8Array) {
    this.#doc.import(update);
  }

  /**
   * Commit current changes
   */
  commit() {
    this.#doc.commit();
  }
}
