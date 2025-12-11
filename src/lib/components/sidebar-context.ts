import { createContext } from "svelte";

export interface SidebarContext {
  isCollapsed: boolean;
  toggleSidebar: () => void;
}

export const [getSidebarContext, setSidebarContext] =
  createContext<SidebarContext>();
