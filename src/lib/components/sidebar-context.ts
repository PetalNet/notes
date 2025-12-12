import { createContext } from "svelte";

interface SidebarContext {
  get isCollapsed(): boolean;

  toggle: () => boolean;
}

export const [getSidebarContext, setSidebarContext] =
  createContext<SidebarContext>();
