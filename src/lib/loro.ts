import { LoroDoc, LoroText, type Frontiers } from "loro-crdt";
import diff from "fast-diff";
import { encryptData, decryptData } from "./crypto";
import { Encoding, Function, Either } from "effect";
import { sync } from "./remote/sync.remote.ts";

export class LoroNoteManager {
  #noteId: string;
  #noteKey: string;
  #doc: LoroDoc;
  #text: LoroText;
  #onUpdate: (snapshot: Uint8Array) => void;
  #eventSource: EventSource | null = null;
  #isSyncing = false;

  constructor(
    noteId: string,
    noteKey: string,
    onUpdate?: (snapshot: Uint8Array) => void,
  ) {
    this.#noteId = noteId;
    this.#noteKey = noteKey;
    this.#doc = new LoroDoc();
    this.#text = this.#doc.getText("content");
    this.#onUpdate = onUpdate ?? Function.constVoid;

    // Initialize frontiers
    this.#lastFrontiers = this.#doc.frontiers();

    // Subscribe to changes
    this.#doc.subscribe((event) => {
      // Notify content listeners
      const content = this.#text.toString();
      this.#contentListeners.forEach((listener) => {
        listener(content);
      });

      // Only trigger update if the change is local or we need to persist remote changes
      // For now, we persist everything to be safe
      const snapshot = this.#doc.export({ mode: "snapshot" });
      this.#onUpdate(snapshot);

      // Send update to server if syncing and change is local
      if (this.#isSyncing && event.by === "local") {
        const frontiers = this.#doc.frontiers();
        // We need to be careful with export updates.
        // For this MVP, let's just export the delta since last sync point if possible,
        // or just export the whole update since last frontiers.
        try {
          const update = this.#doc.export({
            mode: "shallow-snapshot",
            frontiers: this.#lastFrontiers,
          });
          this.#lastFrontiers = frontiers;
          void this.#sendUpdate(update);
        } catch (e) {
          console.error("Error exporting update", e);
        }
      }
    });
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
    }
  }

  #lastFrontiers: Frontiers;

  /**
   * Start real-time sync
   */
  startSync() {
    if (this.#isSyncing) return;
    this.#isSyncing = true;

    // Connect to SSE endpoint
    this.#eventSource = new EventSource(`/api/sync/${this.#noteId}`);

    this.#eventSource.onmessage = (event: MessageEvent<string>) => {
      try {
        const data = JSON.parse(event.data) as unknown as { update: string };
        if (data.update) {
          // Apply remote update
          const updateBytes = Encoding.decodeBase64(data.update).pipe(
            Either.getOrThrow,
          ) as Uint8Array<ArrayBuffer>;
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
      // Retry logic could go here
    };
  }

  /**
   * Stop real-time sync
   */
  stopSync() {
    if (this.#eventSource) {
      this.#eventSource.close();
      this.#eventSource = null;
    }
    this.#isSyncing = false;
  }

  /**
   * Send update to server
   */
  async #sendUpdate(updates: Uint8Array) {
    try {
      await sync({
        noteId: this.#noteId,
        update: Encoding.encodeBase64(updates),
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
