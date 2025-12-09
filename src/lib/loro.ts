import { decryptData, encryptData } from "$lib/crypto";
import { encodeBase64, decodeBase64 } from "@oslojs/encoding";
import { syncSchemaJson } from "$lib/remote/notes.schemas.ts";
import { sync } from "$lib/remote/sync.remote.ts";
import { Schema } from "effect";
import { LoroDoc, LoroText } from "loro-crdt";
import { unawaited } from "./unawaited.ts";
import { Temporal } from "temporal-polyfill";

export type ConnectionState =
  | "connected"
  | "connecting"
  | "disconnected"
  | "reconnecting";

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
  connectionState: ConnectionState = $state("disconnected");
  #retryTimeout: NodeJS.Timeout | null = null;

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
    this.doc.setRecordTimestamp(true);
    this.#text = LoroNoteManager.getTextFromDoc(this.doc);
    this.#onUpdate = onUpdate;

    // Subscribe to changes
    this.doc.subscribeLocalUpdates((update) => {
      console.log(
        "[Loro] Local update detected. Preview:",
        this.#text.toString().slice(0, 20),
        "Update size:",
        update.length,
      );

      // Persist changes
      unawaited(this.#persist());

      // Send local changes immediately
      if (this.#isSyncing) {
        console.log("[Loro] Sending local update to server");
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
      const encryptedBytes = decodeBase64(encryptedSnapshot);
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
    if (this.#retryTimeout) {
      clearTimeout(this.#retryTimeout);
      this.#retryTimeout = null;
    }
    this.#isSyncing = false;
    this.connectionState = "disconnected";
  }

  /**
   * Start real-time sync
   */
  /**
   * Start real-time sync
   */
  startSync(): void {
    if (this.#isSyncing) return;
    this.#isSyncing = true;
    this.connectionState = "connecting";

    // Use SSE endpoint
    this.#eventSource = new EventSource(`/client/doc/${this.#noteId}/events`);

    this.#eventSource.onopen = () => {
      console.log("[Loro] SSE Connected");
      this.connectionState = "connected";
      // Clear any retry loop if we succeeded
      if (this.#retryTimeout) {
        clearTimeout(this.#retryTimeout);
        this.#retryTimeout = null;
      }
    };

    this.#eventSource.onmessage = (event: MessageEvent<string>): void => {
      // console.debug("[Loro] Received SSE message:", event.data.slice(0, 100));
      try {
        const ops = JSON.parse(event.data);
        if (!Array.isArray(ops)) return;

        for (const op of ops) {
          // op.payload is encrypted blob (base64)
          // Loro import expects Uint8Array?
          // Wait, op.payload is base64 string provided by server.
          // Loro import expects Uint8Array.
          // Loro import expects Uint8Array.
          // Support both 'payload' (DB/PubSub normalized) and 'encrypted_payload' (Raw API)
          const base64 = op.payload || op.encrypted_payload;
          if (!base64) {
            console.warn("[Loro] Received op without payload:", op);
            continue;
          }
          const updateBytes = decodeBase64(base64);
          this.doc.import(updateBytes);
        }
        // console.debug(`[Loro] Applied ${ops.length} ops`);
      } catch (error) {
        console.error("Failed to process sync message:", error);
      }
    };

    this.#eventSource.onopen = () => {
      console.log("[Loro] SSE connected");
      this.connectionState.set("connected");
    };

    this.#eventSource.onerror = (error) => {
      console.error("SSE connection error:", error);
      // Browser will auto-reconnect usually, but let's be explicit about state
      if (this.#eventSource?.readyState === EventSource.CLOSED) {
        this.connectionState = "disconnected";
        this.#isSyncing = false;
        // Try to reconnect?
        this.#scheduleReconnect();
      } else if (this.#eventSource?.readyState === EventSource.CONNECTING) {
        this.connectionState = "reconnecting";
      }
    };
  }

  #scheduleReconnect() {
    if (this.#retryTimeout) return;
    this.connectionState = "reconnecting";
    console.log("[Loro] Scheduling reconnect in 3s...");
    this.#retryTimeout = setTimeout(() => {
      this.#retryTimeout = null;
      this.#isSyncing = false; // reset flag to allow startSync
      this.startSync();
    }, 3000);
  }

  /**
   * Send update to server
   */
  async #sendUpdate(update: Uint8Array) {
    try {
      const opId = this.doc.peerId; // Wait, op ID needs to be unique?
      // Loro update is a blob. We wrap it in an Op structure?
      // Server expects: { op: { op_id, actor_id, lamport_ts, encrypted_payload, signature } }
      // Client generates these?
      // Loro `update` is a patch. We treat it as one "Op"?
      // We need `actor_id` (peerId).
      // `lamport_ts`: does Loro expose generic lamport? `doc.oplog.vv`?
      // Or we just use client timestamp/counter?
      // Loro updates are CRDT blobs.
      // For federation Op Log, we wrap the blob.

      const payload = encodeBase64(update);
      const actorId = this.doc.peerIdStr; // string?
      // Loro API check: `doc.peerIdStr` exists.

      // Mock Op structure
      const op = {
        op_id: crypto.randomUUID(),
        actor_id: actorId,
        lamport_ts: Date.now(), // Approximate ordering
        encrypted_payload: payload,
        signature: "TODO", // Client signature!
      };

      await fetch(`/client/doc/${this.#noteId}/push`, {
        method: "POST",
        body: JSON.stringify({ op }),
        headers: { "Content-Type": "application/json" },
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
    return encodeBase64(encrypted);
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

  /**
   * Get version history with user attribution
   * Returns an array of version snapshots traversing the oplog
   */
  getHistory(): HistoryEntry[] {
    const history: HistoryEntry[] = [];

    // Get all changes from the oplog
    const changes = this.doc.getAllChanges();
    const currentText = this.#text.toString();

    // Traverse all changes from all peers
    for (const [peerId, peerChanges] of changes) {
      for (const change of peerChanges) {
        history.push({
          version: change.lamport,
          // Loro timestamps are in seconds, convert to milliseconds
          timestamp: change.timestamp
            ? Temporal.Instant.fromEpochMilliseconds(change.timestamp * 1000)
            : Temporal.Instant.fromEpochMilliseconds(0),
          preview: currentText.slice(0, 100),
          peerId,
        });
      }
    }

    // Sort by lamport timestamp descending (most recent first)
    history.sort((a, b) => b.version - a.version);

    // If no changes found, return current state as fallback
    if (history.length === 0) {
      const currentVersion = this.doc.version();
      history.push({
        version: currentVersion.get(this.doc.peerId) ?? 0,
        timestamp: Temporal.Now.instant(),
        preview: currentText.slice(0, 100),
        peerId: this.doc.peerId.toString(),
      });
    }

    return history;
  }

  /**
   * Subscribe to history changes (live updates)
   */
  subscribeToHistory(callback: () => void): () => void {
    return this.doc.subscribe(callback);
  }
}

export interface HistoryEntry {
  version: number;
  timestamp: Temporal.Instant;
  preview: string;
  peerId: string;
}
