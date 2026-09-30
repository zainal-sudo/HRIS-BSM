export interface AuthUser {
  user: string;
  kd_unit: string;
  kar_nik: string;
  nm_unit: string;
  is_pusat: boolean;
}

export interface AuthResponse {
  user: AuthUser;
  token: string;
  refresh_token: string;
  token_expiry: string;
}

export interface MenuItem {
  men_id: number;
  men_kode: string;
  men_parent: string | null;
  men_ket: string;
  men_route: string;
  men_ordering: number;
  men_icon: string;
  men_id_group: number | null;
  men_status: string;
}

export interface MenuParent {
  kode: string;
  nama: string;
  ordering: number;
  icon: string;
}

export interface SidebarNode {
  key: string;
  label: string;
  icon: string;
  route?: string;
  children?: SidebarNode[];
}

export interface DataPage {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  rows: Record<string, any>[];
}

export interface LookupRow {
  NIK: string;
  Nama: string;
  Jabatan?: string;
  Departmen?: string;
  Unit?: string;
  StatusKaryawan?: string;
}

export interface KaryawanFormOptions {
  units: { Kode: string; Nama: string }[];
  jabatans: { Kode: string; Nama: string }[];
  departemens: { Kode: string; Nama: string }[];
  statusKaryawan: string[];
  statusKawin: string[];
}