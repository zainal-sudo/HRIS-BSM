import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "@/stores/authStore";

const routes = [
  {
    path: "/login",
    name: "login",
    component: () => import("@/views/auth/LoginView.vue"),
    meta: { layout: "BlankLayout", requiresAuth: false, title: "Login" },
  },
  {
    path: "/",
    redirect: "/dashboard",
  },
  {
    path: "/dashboard",
    name: "dashboard",
    component: () => import("@/views/dashboard/DashboardView.vue"),
    meta: { requiresAuth: true, title: "Dashboard" },
  },
  // ── MASTER ──
  { path: "/master/departemen", component: () => import("@/views/master/DepartemenView.vue"), meta: { requiresAuth: true } },
  { path: "/master/departemen/form", component: () => import("@/views/master/DepartemenForm.vue"), meta: { requiresAuth: true } },
  { path: "/master/jabatan", component: () => import("@/views/master/JabatanView.vue"), meta: { requiresAuth: true } },
  { path: "/master/jabatan/form", component: () => import("@/views/master/JabatanForm.vue"), meta: { requiresAuth: true } },
  { path: "/master/unit", component: () => import("@/views/master/UnitView.vue"), meta: { requiresAuth: true } },
  { path: "/master/unit/form", component: () => import("@/views/master/UnitForm.vue"), meta: { requiresAuth: true } },
  { path: "/master/karyawan", component: () => import("@/views/master/KaryawanView.vue"), meta: { requiresAuth: true } },
  { path: "/master/karyawan/form", component: () => import("@/views/master/KaryawanForm.vue"), meta: { requiresAuth: true } },
  {
    path: "/master/setting-gaji-bsm",
    component: () => import("@/views/master/SettingGajiBsmView.vue"),
    meta: { requiresAuth: true, title: "Setting Gaji BSM" },
  },
  {
    path: "/master/setting-gaji-pkrt",
    component: () => import("@/views/master/SettingGajiPkrtView.vue"),
    meta: { requiresAuth: true, title: "Setting Gaji PKRT" },
  },
  // ── TRANSAKSI ──
  { path: "/transaksi/izin", component: () => import("@/views/transaksi/IzinView.vue"), meta: { requiresAuth: true } },
  { path: "/transaksi/izin/form", component: () => import("@/views/transaksi/IzinForm.vue"), meta: { requiresAuth: true } },
  { path: "/transaksi/lembur", component: () => import("@/views/transaksi/LemburView.vue"), meta: { requiresAuth: true } },
  { path: "/transaksi/lembur/form", component: () => import("@/views/transaksi/LemburForm.vue"), meta: { requiresAuth: true } },
  { path: "/transaksi/karyawan-keluar", component: () => import("@/views/transaksi/KeluarView.vue"), meta: { requiresAuth: true } },
  { path: "/transaksi/karyawan-keluar/form", component: () => import("@/views/transaksi/KeluarForm.vue"), meta: { requiresAuth: true } },
  { path: "/transaksi/pkwt", component: () => import("@/views/transaksi/PkwtView.vue"), meta: { requiresAuth: true } },
  { path: "/transaksi/pkwt/form", component: () => import("@/views/transaksi/PkwtForm.vue"), meta: { requiresAuth: true } },
  {
    path: "/transaksi/proses-gaji-roti",
    component: () => import("@/views/transaksi/GajiRotiView.vue"),
    meta: { requiresAuth: true, title: "Proses Gaji Roti" },
  },
  {
    path: "/transaksi/proses-gaji-bsm",
    component: () => import("@/views/transaksi/GajiBsmView.vue"),
    meta: { requiresAuth: true, title: "Proses Gaji BSM" },
  },
  {
    path: "/transaksi/proses-gaji-n3",
    component: () => import("@/views/transaksi/GajiN3View.vue"),
    meta: { requiresAuth: true, title: "Proses Gaji N3" },
  },
  {
    path: "/transaksi/proses-gaji-pkrt",
    component: () => import("@/views/transaksi/GajiPkrtView.vue"),
    meta: { requiresAuth: true, title: "Proses Gaji PKRT" },
  },
  { path: "/master/setting-gaji-n3", component: () => import("@/views/master/SettingGajiN3View.vue"), meta: { requiresAuth: true, title: "Setting Gaji N3" } },
  {
    path: "/master/setting-gaji-roti",
    component: () => import("@/views/master/SettingGajiRotiView.vue"),
    meta: { requiresAuth: true, title: "Setting Gaji Roti" },
  },
  // ── LAPORAN ──
  { path: "/laporan/absensi", component: () => import("@/views/laporan/AbsensiView.vue"), meta: { requiresAuth: true } },
  { path: "/laporan/rekap-absensi", component: () => import("@/views/laporan/RekapAbsensiView.vue"), meta: { requiresAuth: true } },
  { path: "/laporan/kontrak", component: () => import("@/views/laporan/KontrakView.vue"), meta: { requiresAuth: true } },
  // ── SETTING ──
  { path: "/setting/hak-user", component: () => import("@/views/setting/HakUserView.vue"), meta: { requiresAuth: true } },
  { path: "/setting/menu", component: () => import("@/views/setting/MenuView.vue"), meta: { requiresAuth: true } },
  // ── ERRORS ──
  { path: "/403", component: () => import("@/views/errors/ForbiddenView.vue"), meta: { requiresAuth: false, layout: "BlankLayout" } },
  { path: "/404", component: () => import("@/views/errors/NotFoundView.vue"), meta: { requiresAuth: false, layout: "BlankLayout" } },
  { path: "/:catchAll(.*)*", component: () => import("@/views/errors/NotFoundView.vue"), meta: { requiresAuth: false, layout: "BlankLayout" } },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to) => {
  const auth = useAuthStore();
  const publicOnly = to.path === "/login";
  if (to.meta.requiresAuth !== false && !auth.isAuthenticated) {
    return { path: "/login", query: to.query };
  }
  if (publicOnly && auth.isAuthenticated) {
    return { path: "/dashboard" };
  }
  return true;
});

router.afterEach((to) => {
  const title = (to.meta.title as string) || "BSM HRIS";
  document.title = title === "BSM HRIS" ? title : `${title} | BSM HRIS`;
});

export default router;