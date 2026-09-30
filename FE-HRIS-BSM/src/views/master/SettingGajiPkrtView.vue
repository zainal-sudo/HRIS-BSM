<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useToast } from "vue-toastification";
import MsIcon from "@/components/MsIcon.vue";
import CurrencyInput from "@/components/CurrencyInput.vue";
import { api, getErrorMessage } from "@/api/axios";
import { formatNumber } from "@/utils/format";
import { sortByKey, nextSort, sortIconName, type SortDir } from "@/utils/table";

/**
 * Setting Gaji PKRT — padanan form setting gaji PKRT lama (Delphi)
 * memakai database server utama (bukan server BSM).
 *
 * Alur: pilih Unit (PKRT) -> Refresh -> edit kolom angka di grid ->
 * Simpan (UPDATE tkaryawan per NIK dalam 1 transaksi) / Export CSV.
 *
 * Kolom di sini bersifat tetap (master) dan dipakai modul Proses Gaji PKRT:
 *   gapok + tjabatan + tkompetensi + tmakan  -> THP
 *   pph21, bpjskesehatan, bpjstk, simpankoperasi, cicilan -> potongan tetap
 *beserta lembur, insentif, dan potong gaji yang dihitung per periode.
 */

interface RowSettingGajiPkrt {
  nik: string;
  nama: string;
  jabatan: string;
  unit: string;
  sistemgaji: string;
  rekening: string;
  gapok: number;
  tjabatan: number;
  tkompetensi: number;
  tmakan: number;
  pph21: number;
  bpjskesehatan: number;
  bpjstk: number;
  simpankoperasi: number;
  cicilan: number;
  thp: number;
}

interface Unit {
  kode: string;
  nama: string;
}

const toast = useToast();

const unitList = ref<Unit[]>([]);
const unit = ref("");
const rows = ref<RowSettingGajiPkrt[]>([]);
const loading = ref(false);
const saving = ref(false);

const sortBy = ref<string | null>("nik");
const sortDir = ref<SortDir | null>("asc");

function toggleSort(key: string) {
  const s = nextSort(sortBy.value, sortDir.value, key);
  sortBy.value = s.key;
  sortDir.value = s.dir;
}

function sortIcon(key: string) {
  return sortIconName(key, sortBy.value, sortDir.value);
}

const kataKunci = ref("");

const filteredRows = computed(() => {
  const k = kataKunci.value.trim().toLowerCase();
  if (!k) return rows.value;
  return rows.value.filter((r) =>
    [r.nik, r.nama, r.jabatan].some((v) =>
      String(v || "").toLowerCase().includes(k)
    )
  );
});

const sortedRows = computed(() => {
  if (!sortBy.value || !sortDir.value) return filteredRows.value;
  return sortByKey(filteredRows.value, sortBy.value, sortDir.value, (r, k) =>
    r[k as keyof RowSettingGajiPkrt]
  );
});

const num = (v: unknown): number => {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};

const fmt = (v: number) => formatNumber(Number(Number(v || 0).toFixed(0)));

const total = computed(() => {
  const t = {
    gapok: 0,
    tunjangan: 0,
    tmakan: 0,
    thp: 0,
    pph21: 0,
    bpjs: 0,
    koperasi: 0,
    cicilan: 0,
    potongan: 0,
  };
  for (const r of sortedRows.value) {
    t.gapok += num(r.gapok);
    t.tunjangan += num(r.tjabatan) + num(r.tkompetensi);
    t.tmakan += num(r.tmakan);
    t.thp += num(r.thp);
    t.pph21 += num(r.pph21);
    t.bpjs += num(r.bpjskesehatan) + num(r.bpjstk);
    t.koperasi += num(r.simpankoperasi);
    t.cicilan += num(r.cicilan);
    t.potongan +=
      num(r.pph21) +
      num(r.bpjskesehatan) +
      num(r.bpjstk) +
      num(r.simpankoperasi) +
      num(r.cicilan);
  }
  return t;
});

const unitNama = computed(
  () => unitList.value.find((u) => String(u.kode) === String(unit.value))?.nama || ""
);

/** Jumlah karyawan yang Gaji Pokok-nya masih 0 — perlu diisi sebelum proses gaji */
const tanpaGajiPokok = computed(() => rows.value.filter((r) => num(r.gapok) === 0).length);

const simpanDialog = ref(false);
const simpanOke = ref(false);

async function muatUnit() {
  try {
    const { data } = await api.get("/setting-gaji-pkrt/unit");
    unitList.value = data.data || [];
    if (unitList.value.length > 0 && !unit.value) {
      unit.value = String(unitList.value[0].kode);
    }
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat daftar unit"));
  }
}

async function muatData() {
  if (!unit.value) {
    toast.warning("Pilih unit terlebih dahulu");
    return;
  }
  loading.value = true;
  try {
    const { data } = await api.get("/setting-gaji-pkrt", { params: { unit: unit.value } });
    const list: any[] = data.data || [];
    rows.value = list.map((d) => ({
      nik: d.nik,
      nama: d.nama,
      jabatan: d.jabatan || "",
      unit: d.unit || "",
      sistemgaji: d.sistemgaji || "",
      rekening: d.rekening || "",
      gapok: num(d.gapok),
      tjabatan: num(d.tjabatan),
      tkompetensi: num(d.tkompetensi),
      tmakan: num(d.tmakan),
      pph21: num(d.pph21),
      bpjskesehatan: num(d.bpjskesehatan),
      bpjstk: num(d.bpjstk),
      simpankoperasi: num(d.simpankoperasi),
      cicilan: num(d.cicilan),
      thp: num(d.thp),
    }));
    toast.success(`${rows.value.length} karyawan PKRT dimuat`);
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat data setting gaji PKRT"));
  } finally {
    loading.value = false;
  }
}

function kosongkanGrid() {
  rows.value = [];
}

function mintaSimpan() {
  if (rows.value.length === 0) {
    toast.warning("Tidak ada data untuk disimpan");
    return;
  }
  simpanOke.value = false;
  simpanDialog.value = true;
}

async function simpan() {
  if (!simpanOke.value) return;
  simpanOke.value = false;
  simpanDialog.value = false;
  saving.value = true;
  try {
    const payload = {
      unit: unit.value,
      rows: rows.value.map((r) => ({
        nik: r.nik,
        gapok: num(r.gapok),
        tjabatan: num(r.tjabatan),
        tkompetensi: num(r.tkompetensi),
        tmakan: num(r.tmakan),
        pph21: num(r.pph21),
        bpjskesehatan: num(r.bpjskesehatan),
        bpjstk: num(r.bpjstk),
        simpankoperasi: num(r.simpankoperasi),
        cicilan: num(r.cicilan),
      })),
    };
    const { data } = await api.put("/setting-gaji-pkrt", payload);
    toast.success(data.message || "Data setting gaji PKRT berhasil disimpan");
    void muatData();
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal menyimpan data setting gaji PKRT"));
  } finally {
    saving.value = false;
  }
}

function exportCsv() {
  if (rows.value.length === 0) return;
  const header = [
    "NIK", "Nama", "Jabatan", "Unit", "Gapok", "Tunj. Jabatan",
    "Tunj. Kompetensi", "Tunj. Makan", "THP", "PPh21", "BPJS Kesehatan",
    "BPJS TK", "Simpanan Koperasi", "Cicilan", "Rekening",
  ];
  const lines = sortedRows.value.map((r) =>
    [
      r.nik, r.nama, r.jabatan, r.unit, num(r.gapok), num(r.tjabatan),
      num(r.tkompetensi), num(r.tmakan), num(r.thp), num(r.pph21),
      num(r.bpjskesehatan), num(r.bpjstk), num(r.simpankoperasi),
      num(r.cicilan), r.rekening,
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")
  );
  const blob = new Blob(["\ufeff" + [header.join(","), ...lines].join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `setting-gaji-pkrt_${unit.value}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

const infoColumns = [
  { key: "nik", label: "NIK", width: "100px", align: "" },
  { key: "nama", label: "Nama", width: "170px", align: "" },
  { key: "jabatan", label: "Jabatan", width: "140px", align: "" },
  { key: "unit", label: "Unit", width: "130px", align: "" },
] as const;

const editableColumns = [
  { key: "gapok", label: "Gapok", width: "105px" },
  { key: "tjabatan", label: "Tunj. Jabatan", width: "110px" },
  { key: "tkompetensi", label: "Tunj. Kompetensi", width: "115px" },
  { key: "tmakan", label: "Tunj. Makan", width: "105px" },
  { key: "pph21", label: "PPh21", width: "95px" },
  { key: "bpjskesehatan", label: "BPJS Kesehatan", width: "110px" },
  { key: "bpjstk", label: "BPJS TK", width: "100px" },
  { key: "simpankoperasi", label: "Koperasi", width: "100px" },
  { key: "cicilan", label: "Cicilan", width: "95px" },
] as const;

onMounted(() => {
  void muatUnit();
});
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <h2 class="page-title">Setting Gaji PKRT</h2>
        <div class="page-sub">
          Master gaji pokok, tunjangan &amp; potongan tetap karyawan PKRT
        </div>
      </div>
    </div>

    <div class="toolbar">
      <div class="toolbar-left">
        <label class="filter-label">Unit</label>
        <select v-model="unit" class="filter-select">
          <option value="">-- Pilih Unit --</option>
          <option v-for="u in unitList" :key="u.kode" :value="String(u.kode)">{{ u.nama }}</option>
        </select>
        <button class="btn" :disabled="loading || !unit" @click="muatData">
          <MsIcon name="refresh" :size="15" /> {{ loading ? "Memuat..." : "Refresh" }}
        </button>
        <span v-if="unitNama" class="badge muted">{{ unitNama }}</span>
        <div class="search-box">
          <MsIcon name="search" :size="14" />
          <input v-model="kataKunci" type="text" placeholder="Cari NIK / nama / jabatan..." />
          <button v-if="kataKunci" class="search-clear" title="Hapus pencarian" @click="kataKunci = ''">
            <MsIcon name="close" :size="13" />
          </button>
        </div>
      </div>
      <div class="toolbar-right">
        <button class="btn" @click="kosongkanGrid">
          <MsIcon name="filter_list_off" :size="15" /> Kosongkan
        </button>
        <button class="btn" :disabled="rows.length === 0" @click="exportCsv">
          <MsIcon name="download" :size="15" /> Export CSV
        </button>
        <button class="btn primary" :disabled="saving || rows.length === 0" @click="mintaSimpan">
          <MsIcon name="save" :size="15" /> {{ saving ? "Menyimpan..." : "Simpan" }}
        </button>
      </div>
    </div>

    <div v-if="rows.length > 0 && tanpaGajiPokok > 0" class="warn-box">
      <MsIcon name="warning" :size="14" />
      <span>
        <b>{{ tanpaGajiPokok }}</b> karyawan masih punya <b>Gaji Pokok = 0</b>. Isi dulu di
        menu ini, karena nilai ini jadi dasar THP, lembur, dan Potong Gaji pada
        menu Proses Gaji PKRT.
      </span>
    </div>

    <div class="summary-strip">
      <div class="sum-item">
        <span class="sum-icon total"><MsIcon name="group" :size="15" /></span>
        <b>{{ sortedRows.length }}</b>&nbsp;Karyawan
        <span v-if="kataKunci.trim() && sortedRows.length !== rows.length" class="filter-hint">
          dari {{ rows.length }}
        </span>
      </div>
      <div class="sum-item">
        <span class="sum-icon masuk"><MsIcon name="payments" :size="15" /></span>
        <b>{{ fmt(total.gapok) }}</b> Total Gapok
      </div>
      <div class="sum-item">
        <span class="sum-icon lembur"><MsIcon name="card_giftcard" :size="15" /></span>
        <b>{{ fmt(total.tunjangan + total.tmakan) }}</b> Total Tunjangan
      </div>
      <div class="sum-item">
        <span class="sum-icon potong"><MsIcon name="cancel" :size="15" /></span>
        <b>{{ fmt(total.potongan) }}</b> Total Potongan Tetap
      </div>
      <div class="sum-item">
        <span class="sum-icon total"><MsIcon name="account_balance_wallet" :size="15" /></span>
        <b>{{ fmt(total.thp) }}</b> Total THP
      </div>
    </div>

    <div class="table-card">
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th class="c" style="width: 34px">No</th>
              <th
                v-for="c in infoColumns"
                :key="c.key"
                class="sortable"
                :class="[{ sorted: sortBy === c.key }, c.align]"
                :style="{ width: c.width }"
                title="Klik untuk mengurutkan"
                @click="toggleSort(c.key)"
              >
                {{ c.label }}<MsIcon :name="sortIcon(c.key)" :size="12" className="th-sort" />
              </th>
              <th
                v-for="c in editableColumns"
                :key="c.key"
                class="sortable r"
                :class="{ sorted: sortBy === c.key }"
                :style="{ width: c.width }"
                title="Klik untuk mengurutkan"
                @click="toggleSort(c.key)"
              >
                {{ c.label }}<MsIcon :name="sortIcon(c.key)" :size="12" className="th-sort" />
              </th>
              <th class="r" style="width: 110px">THP</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading">
              <td :colspan="15" class="row-empty">Memuat data...</td>
            </tr>
            <tr v-else-if="rows.length === 0">
              <td :colspan="15" class="row-empty">
                Belum ada data. Pilih unit lalu klik &quot;Refresh&quot;.
              </td>
            </tr>
            <tr v-for="(r, i) in sortedRows" :key="r.nik">
              <td class="c">{{ i + 1 }}</td>
              <td>{{ r.nik }}</td>
              <td :title="r.nama">{{ r.nama }}</td>
              <td :title="r.jabatan">{{ r.jabatan || "-" }}</td>
              <td :title="r.unit">{{ r.unit || "-" }}</td>
              <td class="c"><CurrencyInput v-model="r.gapok" class="cell-input" /></td>
              <td class="c"><CurrencyInput v-model="r.tjabatan" class="cell-input" /></td>
              <td class="c"><CurrencyInput v-model="r.tkompetensi" class="cell-input" /></td>
              <td class="c"><CurrencyInput v-model="r.tmakan" class="cell-input" /></td>
              <td class="c"><CurrencyInput v-model="r.pph21" class="cell-input" /></td>
              <td class="c"><CurrencyInput v-model="r.bpjskesehatan" class="cell-input" /></td>
              <td class="c"><CurrencyInput v-model="r.bpjstk" class="cell-input" /></td>
              <td class="c"><CurrencyInput v-model="r.simpankoperasi" class="cell-input" /></td>
              <td class="c"><CurrencyInput v-model="r.cicilan" class="cell-input" /></td>
              <td class="r strong">{{ fmt(r.thp) }}</td>
            </tr>
          </tbody>
          <tfoot v-if="rows.length > 0">
            <tr>
              <td colspan="5" class="r strong">TOTAL</td>
              <td class="r strong">{{ fmt(total.gapok) }}</td>
              <td class="r strong">{{ fmt(total.tunjangan) }}</td>
              <td class="r strong">{{ fmt(total.tmakan) }}</td>
              <td class="r strong">{{ fmt(total.pph21) }}</td>
              <td class="r strong">{{ fmt(total.bpjs) }}</td>
              <td class="r strong"></td>
              <td class="r strong">{{ fmt(total.potongan) }}</td>
              <td class="r strong">{{ fmt(total.thp) }}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div class="table-note">
        <MsIcon name="info" :size="13" />
        Klik judul kolom untuk mengurutkan. Kolom <b>NIK / Nama / Jabatan / Unit</b>
        terkunci, kolom angka diketik langsung di grid lalu tekan <b>Simpan</b>
        (1 transaksi untuk semua baris). Kolom <b>THP</b> dihitung otomatis
        (Gapok + Tunj. Jabatan + Tunj. Kompetensi + Tunj. Makan) dan menjadi dasar
        perhitungan lembur serta Potong Gaji di menu Proses Gaji PKRT.
      </div>
    </div>

    <!-- Konfirmasi simpan -->
    <v-dialog v-model="simpanDialog" max-width="440" persistent>
      <v-card rounded="false">
        <v-card-item class="py-3">
          <div class="d-flex align-center">
            <span class="material-symbols-outlined" style="color: #d97706; margin-right: 8px">warning</span>
            <v-card-title class="text-body-1 font-weight-bold pa-0">Simpan Setting Gaji PKRT</v-card-title>
          </div>
        </v-card-item>
        <v-card-text class="text-body-2">
          <div class="mb-2">
            Unit <b>{{ unitNama || unit }}</b> dengan <b>{{ rows.length }}</b> karyawan.
          </div>
          <div class="warn-box">
            Data akan menimpa nilai gaji pokok, tunjangan, dan potongan tetap pada
            modul karyawan, serta dipakai pada seluruh proses gaji PKRT berikutnya.
          </div>
        </v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-checkbox
            v-model="simpanOke"
            color="primary"
            density="compact"
            hide-details
            label="Ya, timpa setting gaji untuk karyawan di atas"
          />
          <v-spacer />
          <v-btn variant="text" rounded="false" @click="simpanDialog = false">Batal</v-btn>
          <v-btn color="primary" rounded="false" :disabled="!simpanOke" @click="simpan">
            Simpan
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>


<!--STYLE-->
