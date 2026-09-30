import { defineStore } from "pinia";
import { authApi } from "@/api";
import { TOKEN_KEY, REFRESH_KEY, USER_KEY } from "@/api/axios";
import type { AuthUser } from "@/types";

function readUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export const useAuthStore = defineStore("auth", {
  state: () => ({
    token: localStorage.getItem(TOKEN_KEY) || "",
    refreshToken: localStorage.getItem(REFRESH_KEY) || "",
    user: readUser(),
  }),

  getters: {
    isAuthenticated: (state) => !!state.token && !!state.user,
  },

  actions: {
    async login(username: string, password: string) {
      const res = await authApi.login({ username, password });
      this.token = res.token;
      this.refreshToken = res.refresh_token;
      this.user = res.user;
      localStorage.setItem(TOKEN_KEY, res.token);
      localStorage.setItem(REFRESH_KEY, res.refresh_token);
      localStorage.setItem(USER_KEY, JSON.stringify(res.user));
      return res;
    },

    setToken(token: string) {
      this.token = token;
      localStorage.setItem(TOKEN_KEY, token);
    },

    logout() {
      this.token = "";
      this.refreshToken = "";
      this.user = null;
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_KEY);
      localStorage.removeItem(USER_KEY);
    },
  },
});