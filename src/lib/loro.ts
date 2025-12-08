import { decryptData, encryptData } from "$lib/crypto";
import { syncSchemaJson } from "$lib/remote/notes.schemas.ts";
import { sync } from "$lib/remote/sync.remote.ts";
import { Schema } from "effect";
import { LoroDoc, LoroText } from "loro-crdt";
import { unawaited } from "./unawaited.ts";

export type Doc = LoroDoc<{
  content: LoroText;
}>;

export class LoroNoteManager {
  #noteId: string;
  #noteKey: string;
  doc: Doc;
  #text: LoroText;
  #onUpdate: (snapshot: string) => void | Promise<void>;
  #eventSource: EventSource | null = null;
  #isSyncing = false;

  static getTextFromDoc(this: void, doc: LoroDoc): LoroText {
    return doc.getText("content");
  }

  /** @private */
  private constructor(
    noteId: string,
    noteKey: string,
    onUpdate: (snapshot: string) => Promise<void>,
  ) {
    console.log("LoroNoteManager created for note:", noteId);

    this.#noteId = noteId;
    this.#noteKey = noteKey;
    this.doc = new LoroDoc();
    this.#text = LoroNoteManager.getTextFromDoc(this.doc);
    this.#onUpdate = onUpdate;

    // Subscribe to changes
    this.doc.subscribeLocalUpdates((update) => {
      console.debug(
        "Loro document changed. Preview:",
        this.#text.toString().slice(0, 20),
      );

      // Persist changes
      unawaited(this.#persist());

      // Send local changes immediately
      if (this.#isSyncing) {
        unawaited(this.#sendUpdate(update));
      }
    });
  }

  /**
   * Initialize the manager with an encrypted snapshot
   */
  static async create(
    this: void,
    noteId: string,
    noteKey: string,
    onUpdate: (snapshot: string) => Promise<void>,
    encryptedSnapshot: string | null,
  ): Promise<LoroNoteManager> {
    const manager = new LoroNoteManager(noteId, noteKey, onUpdate);

    if (encryptedSnapshot) {
      const encryptedBytes = Uint8Array.fromBase64(encryptedSnapshot);
      const decrypted = await decryptData(encryptedBytes, manager.#noteKey);
      manager.doc.import(decrypted);
    }
    return manager;
  }

  async #persist() {
    const snapshot = await this.getEncryptedSnapshot();
    await this.#onUpdate(snapshot);
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
   * Start real-time sync
   */
  startSync(): void {
    if (this.#isSyncing) return;
    this.#isSyncing = true;

    this.#eventSource = new EventSource(`/api/sync/${this.#noteId}`);

    this.#eventSource.onmessage = (event: MessageEvent<string>): void => {
      try {
        const data = Schema.decodeSync(syncSchemaJson)(event.data);
        const updateBytes = Uint8Array.fromBase64(data.update);
        this.doc.import(updateBytes);
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
   * Send update to server
   */
  async #sendUpdate(update: Uint8Array) {
    try {
      await sync({
        noteId: this.#noteId,
        update: update.toBase64(),
      });
    } catch (error) {
      console.error("Failed to send update:", error);
    }
  }

  /**
   * Get encrypted snapshot for storage
   */
  async getEncryptedSnapshot(): Promise<string> {
    const snapshot = this.doc.export({
      mode: "snapshot",
    }) as Uint8Array<ArrayBuffer>;
    const encrypted = await encryptData(snapshot, this.#noteKey);
    return encrypted.toBase64();
  }

  /**
   * Get the current version/frontiers of the document
   */
  getVersion() {
    return this.doc.version();
  }

  /**
   * Get frontiers (latest version points) of the document
   */
  getFrontiers() {
    return this.doc.frontiers();
  }

  /**
   * Get the text content
   */
  getText(): string {
    return this.#text.toString();
  }
}
