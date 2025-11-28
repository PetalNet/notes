import { createContext } from "svelte";

export const [getUserPrivateKey, setUserPrivateKey] = createContext<string>();
