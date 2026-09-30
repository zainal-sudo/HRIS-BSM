import { defineStore } from "pinia";
import { api } from "@/api/axios";
import { useAuthStore } from "@/stores/authStore";
import type { SidebarNode } from "@/types";

interface MenuItemRaw {
  label: string;
  to: string;
  icon: string;
  tabTitle?: string;
  tabIcon?: string;
}

interface MenuParentRaw {
  label: string;
  icon: string;
  items: MenuItemRaw[];
}

export const usePermissionStore = defineStore("permission", {
  state: () => ({
    menuTree: [] as SidebarNode[],
    loaded: false,
    loading: false,
  }),

  actions: {
    reset() {
      this.menuTree = [];
      this.loaded = false;
      this.loading = false;
    },
    async fetchAll() {
      const auth = useAuthStore();
      if (!auth.user) return;
      this.loading = true;
      try {
        const { data } = await api.get<{ success: boolean; data: MenuParentRaw[] }>(
          `/menu/user/${auth.user.user}`
        );
        this.menuTree = (data.data || []).map((parent) => ({
          key: parent.label,
          label: parent.label,
          icon: parent.icon || "pi pi-bars",
          children: (parent.items || []).map((item) => ({
            key: item.to || item.label,
            label: item.label,
            icon: item.icon || "pi pi-circle",
            route: item.to,
          })),
        }));
        this.loaded = true;
      } finally {
        this.loading = false;
      }
    },
  },
});