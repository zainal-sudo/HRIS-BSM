import type { AxiosRequestConfig } from "axios";
import { api, getErrorMessage } from "./axios";
import type { AuthResponse, AuthUser } from "@/types";

export interface LoginPayload {
  username: string;
  password: string;
}

export const authApi = {
  async login(payload: LoginPayload): Promise<AuthResponse> {
    const { data } = await api.post<{ success: boolean; message: string; data: AuthResponse }>(
      "/auth/login",
      payload
    );
    return data.data;
  },

  async refresh(refreshToken: string): Promise<string> {
    const { data } = await api.post<{ success: boolean; data: { token: string } }>(
      "/auth/refresh",
      {},
      { headers: { "x-refresh-token": refreshToken } } as AxiosRequestConfig
    );
    return data.data.token;
  },

  async logout(): Promise<void> {
    try {
      await api.post("/auth/logout");
    } catch (e) {
      // abaikan
    }
  },
};

export interface Paginated<T> {
  success: boolean;
  message: string;
  data: T;
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export function isSuccess(data: any): boolean {
  return data?.success === true;
}

export async function safeGet<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const { data } = await api.get<{ success: boolean; message: string; data: T }>(url, config);
  return data.data;
}

export async function safePost<T>(url: string, body?: any): Promise<T> {
  const { data } = await api.post<{ success: boolean; message: string; data: T }>(url, body);
  return data.data;
}

export async function safePut<T>(url: string, body?: any): Promise<T> {
  const { data } = await api.put<{ success: boolean; message: string; data: T }>(url, body);
  return data.data;
}

export async function safeDelete<T>(url: string): Promise<T> {
  const { data } = await api.delete<{ success: boolean; message: string; data: T }>(url);
  return data.data;
}

export function pickError(err: unknown): string {
  return getErrorMessage(err, "Terjadi kesalahan");
}