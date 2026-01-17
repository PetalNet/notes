import { decryptData, encryptData } from "$lib/crypto.ts";
import { syncSchemaJson } from "$lib/remote/notes.schemas.ts";
import { sync } from "$lib/remote/sync.remote.ts";
import { Schema } from "effect";
import diff from "fast-diff";
import { LoroDoc, type LoroText } from "loro-crdt";
import { useThrottle } from "runed";

type UseThrottleReturn<Args extends unknown[], Return> = ((
  this: unknown,
  ...args: Args
) => Promise<Return>) & {
  cancel: () => void;
  pending: boolean;
};

export type Doc = LoroDoc<{
  content: LoroText;
}>;

export class LoroNoteManager {
  #noteId: string;
  #noteKey: Uint8Array<ArrayBuffer>;
  #doc: Doc;
  #text: LoroText;
  #onUpdate: (snapshot: Uint8Array<ArrayBuffer>) => Promise<void>;
  #eventSource: EventSource | null = null;
  #isSyncing = false;
  #debouncedPersist: UseThrottleReturn<[], void>;

  // Reactive content state - automatically tracked by Svelte
  content = $state("");

  /** @private */
  private constructor(
    noteId: string,
    noteKey: Uint8Array<ArrayBuffer>,
    onUpdate: (snapshot: Uint8Array<ArrayBuffer>) => Promise<void>,
  ) {
    this.#noteId = noteId;
    this.#noteKey = noteKey;
    this.#doc = new LoroDoc();
    this.#text = this.#doc.getText("content");
    this.#onUpdate = onUpdate;

    // Create debounced persist function
    this.#debouncedPersist = useThrottle(() => {
      this.#persist().catch((e: unknown) => {
        console.error("Failed to persist:", e);
      });
    });

    // Subscribe to local changes only
    this.#doc.subscribeLocalUpdates((update) => {
      console.debug("[Loro] Local update. Size:", update.length);

      // Update reactive content
      this.content = this.getContent();

      // Debounced persist
      // eslint-disable-next-line no-void
      void this.#debouncedPersist();

      // Send update if syncing
      if (this.#isSyncing) {
        this.#sendUpdate(update).catch((e: unknown) => {
          console.error("Failed to send update:", e);
        });
      }
    });
  }

  /**
   * Create and initialize a manager
   */
  static async create(
    noteId: string,
    noteKey: Uint8Array<ArrayBuffer>,
    onUpdate: (snapshot: Uint8Array<ArrayBuffer>) => Promise<void>,
    encryptedSnapshot?: Uint8Array<ArrayBuffer>,
  ): Promise<LoroNoteManager> {
    const manager = new LoroNoteManager(noteId, noteKey, onUpdate);

    if (encryptedSnapshot) {
      await loadEncryptedSnapshot(
        encryptedSnapshot,
        manager.#doc,
        manager.#noteKey,
      );
    }

    // Initialize reactive content
    manager.content = manager.getContent();

    return manager;
  }

  destroy(): void {
    this.stopSync();
  }

  async #persist(): Promise<void> {
    const snapshot = await getEncryptedSnapshot(this.#doc, this.#noteKey);
    await this.#onUpdate(snapshot);
  }

  /**
   * Start real-time sync
   */
  startSync(): void {
    if (this.#isSyncing) return;
    this.#isSyncing = true;

    this.#eventSource = new EventSource(`/api/sync/${this.#noteId}`);

    this.#eventSource.onmessage = (event: MessageEvent<string>): void => {
      try {
        const data = Schema.decodeSync(syncSchemaJson)(event.data);

        for (const update of data.updates) {
          const updateBytes = Uint8Array.fromBase64(update);
          this.#doc.import(updateBytes);
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

  /**
   * Stop real-time sync
   */
  stopSync(): void {
    if (this.#eventSource) {
      this.#eventSource.close();
      this.#eventSource = null;
    }
    this.#isSyncing = false;
  }

  /**
   * Send update to server
   */
  async #sendUpdate(update: Uint8Array): Promise<void> {
    await sync({
      noteId: this.#noteId,
      updates: [update.toBase64()],
    });
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
  updateContent(newContent: string): void {
    const currentContent = this.#text.toString();
    if (currentContent === newContent) return;

    console.debug("[Loro] Updating content with diff...");

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

    this.#doc.commit();
  }
}

/**
 * Get encrypted snapshot for storage
 */
export async function getEncryptedSnapshot(
  doc: Doc,
  noteKey: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const snapshot = doc.export({
    mode: "snapshot",
  }) as Uint8Array<ArrayBuffer>;
  return await encryptData(snapshot, noteKey);
}

/**
 * Load from encrypted snapshot
 */
async function loadEncryptedSnapshot(
  encryptedSnapshot: Uint8Array<ArrayBuffer>,
  doc: Doc,
  noteKey: Uint8Array<ArrayBuffer>,
): Promise<void> {
  try {
    const decrypted = await decryptData(encryptedSnapshot, noteKey);
    doc.import(decrypted);
  } catch (error) {
    console.warn(
      "Failed to load encrypted snapshot (falling back to empty doc):",
      error,
    );
  }
}
