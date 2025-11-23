import { LoroDoc, LoroText } from "loro-crdt";
import diff from "fast-diff";
import { encryptData, decryptData } from "./crypto";

export class LoroNoteManager {
  private noteId: string;
  private noteKey: string;
  private doc: LoroDoc;
  private text: LoroText;
  private onUpdate: (snapshot: Uint8Array) => void;
  private eventSource: EventSource | null = null;
  private isSyncing = false;

  constructor(
    noteId: string,
    noteKey: string,
    onUpdate?: (snapshot: Uint8Array) => void,
  ) {
    this.noteId = noteId;
    this.noteKey = noteKey;
    this.doc = new LoroDoc();
    this.text = this.doc.getText("content");
    this.onUpdate = onUpdate || (() => {});

    // Initialize frontiers
    this.lastFrontiers = this.doc.frontiers();

    // Subscribe to changes
    this.doc.subscribe(async (event) => {
      // Notify content listeners
      const content = this.text.toString();
      this.contentListeners.forEach((listener) => listener(content));

      // Only trigger update if the change is local or we need to persist remote changes
      // For now, we persist everything to be safe
      const snapshot = this.doc.export({ mode: "snapshot" });
      console.log(
        "[Loro] Triggering onUpdate callback, snapshot size:",
        snapshot.byteLength,
      );
      await this.onUpdate(snapshot);

      // Send update to server if syncing and change is local
      // Note: We skip SSE sync for now as it causes issues with manual text updates
      // SSE sync is better suited for actual collaborative CRDT operations
      // For now, we rely on the snapshot-based auto-save which works reliably
      if (false && this.isSyncing && event.by === "local") {
        try {
          const frontiers = this.doc.frontiers();

          // Only try to export update if we have previous frontiers
          if (this.lastFrontiers && this.lastFrontiers.length > 0) {
            const update = this.doc.export({
              mode: "update",
              from: this.lastFrontiers,
            });
            this.sendUpdate(update);
          }

          this.lastFrontiers = frontiers;
        } catch (e) {
          console.error("Error exporting update", e);
          // Fallback: just update lastFrontiers without sending
          this.lastFrontiers = this.doc.frontiers();
        }
      }
    });
  }

  private contentListeners: ((content: string) => void)[] = [];

  /**
   * Subscribe to content changes
   */
  subscribeToContent(listener: (content: string) => void) {
    this.contentListeners.push(listener);
    // Return unsubscribe function
    return () => {
      this.contentListeners = this.contentListeners.filter(
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
      // Reset frontiers after loading snapshot to avoid export errors
      this.lastFrontiers = this.doc.frontiers();
    }
  }

  private lastFrontiers: any; // Frontiers type depends on Loro version

  /**
   * Start real-time sync
   */
  startSync() {
    if (this.isSyncing) return;
    this.isSyncing = true;

    // Connect to SSE endpoint
    this.eventSource = new EventSource(`/api/sync/${this.noteId}`);

    this.eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.update) {
          // Apply remote update
          const updateBytes = this.base64ToBytes(data.update);
          this.doc.import(updateBytes);
        }
      } catch (error) {
        console.error("Failed to process sync message:", error);
      }
    };

    this.eventSource.onerror = (error) => {
      console.error("SSE connection error:", error);
      this.eventSource?.close();
      this.isSyncing = false;
      // Retry logic could go here
    };
  }

  /**
   * Stop real-time sync
   */
  stopSync() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.isSyncing = false;
  }

  /**
   * Send update to server
   */
  private async sendUpdate(updates: Uint8Array) {
    // Assuming we can get the update bytes
    try {
      const updateBase64 = this.bytesToBase64(updates);
      await fetch("/api/sync/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          noteId: this.noteId,
          update: updateBase64,
        }),
      });
    } catch (error) {
      console.error("Failed to send update:", error);
    }
  }

  // ... existing methods ...

  /**
   * Get current text content
   */
  getContent(): string {
    return this.text.toString();
  }

  /**
   * Update text content
   */
  /**
   * Update text content using diffs
   */
  updateContent(newContent: string) {
    const currentContent = this.text.toString();
    if (currentContent === newContent) return;

    console.log("[Loro] Updating content with diff...");

    // Calculate diff
    const diffs = diff(currentContent, newContent);

    let index = 0;
    for (const [type, text] of diffs) {
      if (type === 0) {
        // EQUAL
        index += text.length;
      } else if (type === 1) {
        // INSERT
        this.text.insert(index, text);
        index += text.length;
      } else if (type === -1) {
        // DELETE
        this.text.delete(index, text.length);
      }
    }

    // Commit the changes to trigger the subscription
    this.doc.commit();
  }

  /**
   * Get encrypted snapshot for storage
   */
  async getEncryptedSnapshot(): Promise<string> {
    const snapshot = this.doc.export({ mode: "snapshot" });
    const encrypted = await encryptData(snapshot, this.noteKey);
    return this.bytesToBase64(encrypted);
  }

  /**
   * Load from encrypted snapshot
   */
  async loadEncryptedSnapshot(encryptedSnapshot: string) {
    try {
      const encryptedBytes = this.base64ToBytes(encryptedSnapshot);
      const decrypted = await decryptData(encryptedBytes, this.noteKey);
      this.doc.import(decrypted);
    } catch (error) {
      console.error("Failed to load encrypted snapshot:", error);
      throw error;
    }
  }

  /**
   * Apply update from another peer
   */
  applyUpdate(update: Uint8Array) {
    this.doc.import(update);
  }

  /**
   * Commit current changes
   */
  commit() {
    this.doc.commit();
  }

  // Helper methods
  private bytesToBase64(bytes: Uint8Array): string {
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private base64ToBytes(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
}
