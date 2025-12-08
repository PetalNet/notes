export const SIDEBAR_CONTEXT_KEY = Symbol("sidebar-context");

export interface SidebarContext {
  isCollapsed: boolean;
  toggleSidebar: () => void;
}
