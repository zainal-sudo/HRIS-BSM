<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useToast } from "vue-toastification";
import MsIcon from "@/components/MsIcon.vue";
import KpiCard from "@/components/KpiCard.vue";
import BChart from "@/components/BChart.vue";
import { api, getErrorMessage } from "@/api/axios";

const toast = useToast();
const loading = ref(true);

const summary = ref({
  total_karyawan: 0,
  total_unit: 0,
  total_departemen: 0,
  kontrak_habis: 0,
});
const izinHariIni = ref(0);
const lemburHariIni = ref(0);
const karyawanPerBulan = ref<{ labels: string[]; data_masuk: number[]; data_keluar: number[] }>({
  labels: [],
  data_masuk: [],
  data_keluar: [],
});
const kontrakPerBulan = ref<{ labels: string[]; data: number[] }>({ labels: [], data: [] });
const aktivitas = ref<any[]>([]);
const organisasi = ref<any>({ total_keseluruhan: 0, perusahaan: [] });

const spanPerBulan = computed(() => {
  const labels = karyawanPerBulan.value.labels;
  const masuk = karyawanPerBulan.value.data_masuk;
  const keluar = karyawanPerBulan.value.data_keluar;
  if (labels.length === 0) return 0;
  let m = 0;
  for (const v of masuk) m += v;
  let k = 0;
  for (const v of keluar) k += v;
  return { masuk: m, keluar: k };
});

const spanMasuk = computed(() => (spanPerBulan.value === 0 ? 0 : spanPerBulan.value.masuk));
const spanKeluar = computed(() => (spanPerBulan.value === 0 ? 0 : spanPerBulan.value.keluar));

const kontrakTotalSpan = computed(() => {
  let t = 0;
  for (const v of kontrakPerBulan.value.data) t += v;
  return t;
});

async function load() {
  loading.value = true;
  try {
    const [{ data: s }, { data: iz }, { data: lm }, { data: kb }, { data: kbPerBulan }, { data: ak }, { data: org }] =
      await Promise.all([
        api.get("/dashboard/summary"),
        api.get("/dashboard/izin-hari-ini"),
        api.get("/dashboard/lembur-hari-ini"),
        api.get("/dashboard/karyawan-per-bulan"),
        api.get("/dashboard/kontrak-berakhir-per-bulan"),
        api.get("/dashboard/aktivitas-terbaru"),
        api.get("/dashboard/organisasi"),
      ]);
    summary.value = s.data;
    izinHariIni.value = iz.data?.total || 0;
    lemburHariIni.value = lm.data?.total || 0;
    karyawanPerBulan.value = kb.data;
    kontrakPerBulan.value = kbPerBulan.data;
    aktivitas.value = ak.data || [];
    organisasi.value = org.data;
  } catch (e) {
    toast.error(getErrorMessage(e));
  } finally {
    loading.value = false;
  }
}

function aktivitasIcon(tipe: string) {
  if (tipe === "Izin") return "event_available";
  if (tipe === "Lembur") return "schedule";
  return "person_add";
}
function aktivitasColor(tipe: string) {
  if (tipe === "Izin") return "#D97706";
  if (tipe === "Lembur") return "#3B82F6";
  return "#059669";
}

onMounted(load);
</script>

<template>
  <div class="dash">
    <div v-if="loading" class="dash-loading">
      <span class="spinner"></span> Memuat dashboard...
    </div>

    <template v-else>
      <!-- KPI ROW 1 -->
      <div class="kpi-grid">
        <KpiCard label="Total Karyawan Aktif" :value="summary.total_karyawan" icon="groups" color="#3b5998" />
        <KpiCard label="Total Unit" :value="summary.total_unit" icon="apartment" color="#059669" />
        <KpiCard label="Total Departemen" :value="summary.total_departemen" icon="account_tree" color="#D97706" />
        <KpiCard label="Kontrak Berakhir 60 Hari" :value="summary.kontrak_habis" icon="hourglass_bottom" color="#DC2626" />
      </div>

      <!-- KPI ROW 2 -->
      <div class="kpi-grid">
        <KpiCard label="Izin Hari Ini" :value="izinHariIni" icon="event_available" color="#7C3AED" />
        <KpiCard label="Lembur Hari Ini" :value="lemburHariIni" icon="schedule" color="#0EA5E9" />
        <KpiCard label="Karyawan Masuk (12 bln)" :value="spanMasuk" icon="person_add" color="#0891B2" />
        <KpiCard label="Karyawan Keluar (12 bln)" :value="spanKeluar" icon="person_remove" color="#64748B" />
      </div>

      <!-- CHARTS -->
      <div class="dash-grid-2">
        <div class="panel">
          <div class="panel-head">
            <MsIcon name="bar_chart" :size="16" />
            <span>Pertumbuhan Karyawan (12 Bulan Terakhir)</span>
          </div>
          <div class="panel-body">
            <BChart
              type="bar"
              :labels="karyawanPerBulan.labels"
              :datasets="[
                { label: 'Masuk', data: karyawanPerBulan.data_masuk, color: '#3b5998' },
                { label: 'Keluar', data: karyawanPerBulan.data_keluar, color: '#DC2626' },
              ]"
              :height="270"
            />
          </div>
        </div>

        <div class="panel">
          <div class="panel-head">
            <MsIcon name="event" :size="16" />
            <span>Kontrak Berakhir (6 Bulan Ke Depan)</span>
            <span class="panel-total">{{ kontrakTotalSpan }} total</span>
          </div>
          <div class="panel-body">
            <BChart
              type="bar"
              :labels="kontrakPerBulan.labels"
              :datasets="[{ label: 'Kontrak Berakhir', data: kontrakPerBulan.data, color: '#D97706' }]"
              :height="270"
            />
          </div>
        </div>
      </div>

      <!-- ACTIVITY + ORG -->
      <div class="dash-grid-2">
        <div class="panel">
          <div class="panel-head">
            <MsIcon name="history" :size="16" />
            <span>Aktivitas Terbaru (7 Hari)</span>
          </div>
          <div class="panel-body pa-0">
            <div v-if="aktivitas.length === 0" class="dash-empty">Belum ada aktivitas terbaru</div>
            <div v-else class="akt-list">
              <div v-for="(a, i) in aktivitas" :key="i" class="akt-row">
                <span class="akt-icon" :style="{ background: aktivitasColor(a.tipe) }">
                  <MsIcon :name="aktivitasIcon(a.tipe)" :size="14" />
                </span>
                <div class="akt-info">
                  <div class="akt-title">
                    <strong>{{ a.nama }}</strong>
                    <small>({{ a.nik }})</small>
                  </div>
                  <div class="akt-sub">{{ a.aksi }}</div>
                </div>
                <span class="akt-date">{{ String(a.tanggal).slice(0, 10) }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="panel">
          <div class="panel-head">
            <MsIcon name="account_tree" :size="16" />
            <span>Struktur Organisasi</span>
            <span class="panel-total">{{ organisasi.total_keseluruhan }} karyawan</span>
          </div>
          <div class="panel-body org-scroll">
            <div
              v-for="p in organisasi.perusahaan"
              :key="p.nama"
              class="org-perusahaan"
            >
              <div class="org-head">
                <strong>{{ p.nama }}</strong>
                <span class="org-total">{{ p.total }} karyawan</span>
              </div>
              <div v-for="c in p.cabang" :key="c.nama" class="org-cabang">
                <div class="org-cabang-head">
                  <MsIcon name="apartment" :size="14" />
                  <span>{{ c.nama }} <small>({{ c.kd_unit }})</small></span>
                  <em>{{ c.total }}</em>
                </div>
                <div class="org-dept">
                  <div v-for="d in c.departemen" :key="d.nama" class="org-dept-row">
                    <span>{{ d.nama }}</span>
                    <em>{{ d.total }}</em>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.dash {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.dash-loading {
  padding: 48px;
  text-align: center;
  color: #6b7a90;
  font-size: 13px;
}
.spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid var(--ds-border, #b0b8c4);
  border-top-color: var(--ds-primary, #3b5998);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  vertical-align: -3px;
  margin-right: 8px;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}
.dash-grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.panel {
  border: 1px solid var(--ds-border, #b0b8c4);
  background: var(--ds-surface, #f0f3f8);
  display: flex;
  flex-direction: column;
}
.panel-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--ds-surface-variant, #e0e4ea);
  border-bottom: 1px solid var(--ds-border, #c0c8d4);
  font-size: 12px;
  font-weight: 800;
  color: var(--ds-on-surface, #1b2d4a);
}
.panel-total {
  margin-left: auto;
  font-size: 10px;
  font-weight: 700;
  color: #6b7a90;
  border: 1px solid var(--ds-border, #c0c8d4);
  padding: 2px 8px;
  background: #fff;
}
.panel-body {
  padding: 12px;
  flex: 1;
}
.pa-0 {
  padding: 0;
}
.dash-empty {
  padding: 26px;
  text-align: center;
  color: #6b7a90;
  font-size: 12px;
}
.akt-list {
  max-height: 360px;
  overflow: auto;
}
.akt-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-bottom: 1px solid #e3e7ee;
}
.akt-row:hover {
  background: var(--ds-primary-lighten-1, #e8edf5);
}
.akt-icon {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex: 0 0 26px;
}
.akt-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  line-height: 1.25;
}
.akt-title strong {
  font-size: 12px;
  color: var(--ds-on-surface, #1b2d4a);
}
.akt-title small {
  color: #6b7a90;
  font-size: 10px;
}
.akt-sub {
  font-size: 11px;
  color: #55637a;
}
.akt-date {
  font-size: 10.5px;
  color: #6b7a90;
  white-space: nowrap;
}
.org-scroll {
  max-height: 360px;
  overflow: auto;
}
.org-perusahaan {
  margin-bottom: 12px;
}
.org-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 10px;
  background: var(--ds-primary, #3b5998);
  color: #fff;
  font-size: 12px;
}
.org-head .org-total {
  font-size: 10.5px;
  background: rgba(255, 255, 255, 0.18);
  padding: 2px 8px;
}
.org-cabang {
  margin: 6px 0 0 10px;
  border-left: 2px solid var(--ds-border, #c0c8d4);
}
.org-cabang-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  font-size: 11.5px;
  font-weight: 700;
  color: var(--ds-on-surface, #1b2d4a);
}
.org-cabang-head small {
  color: #6b7a90;
  font-weight: 400;
}
.org-cabang-head em,
.org-dept-row em {
  margin-left: auto;
  font-style: normal;
  font-weight: 700;
  color: var(--ds-primary, #3b5998);
}
.org-dept {
  margin-left: 18px;
}
.org-dept-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  font-size: 11px;
  color: #55637a;
}
@media (max-width: 1100px) {
  .kpi-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .dash-grid-2 {
    grid-template-columns: 1fr;
  }
}
</style>