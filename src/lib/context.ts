import type { LoroNoteManager } from "$lib/loro";
import { createContext } from "svelte";

export const [getUserPrivateKey, setUserPrivateKey] = createContext<string>();
export const [getLoroManager, setLoroManager] =
  createContext<LoroNoteManager>();
