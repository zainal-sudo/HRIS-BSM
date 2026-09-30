<script setup lang="ts">
import { ref } from "vue";
import { useToast } from "vue-toastification";
import BaseBrowse from "@/components/BaseBrowse.vue";
import CetakPkwtDialog from "@/components/CetakPkwtDialog.vue";
import { api, getErrorMessage } from "@/api/axios";
import { todaySql } from "@/utils/format";

const firstOfMonth = todaySql().slice(0, 8) + "01";

const toast = useToast();
const cetakDialogRef = ref<InstanceType<typeof CetakPkwtDialog> | null>(null);
const cetakItem = ref<Record<string, any> | null>(null);

async function openCetak(row: Record<string, any>) {
  try {
    const { data } = await api.get(`/pkwt/${row.Nomor}`);
    const d = data.data || {};
    // Petakan key snake_case detail -> bentuk yang dipakai dialog cetak
    cetakItem.value = {
      Nomor: d.pkwt_nomor ?? row.Nomor,
      Nama: d.kar_nama ?? row.Nama,
      Jabatan: d.nm_jabat ?? row.Jabatan,
      TempatLahir: d.kar_tempatlahir ?? "",
      TglLahir: d.kar_tgllahir ?? "",
      Alamat: d.kar_alamat ?? "",
      TglMulai: d.pkwt_tgl_mulai2 ?? row.TglMulai,
      TglAkhir: d.pkwt_tgl_akhir2 ?? row.TglAkhir,
      unit2: d.unit2 ?? "",
    };
    cetakDialogRef.value?.open();
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat data PKWT"));
  }
}
</script>

<template>
  <div>
    <BaseBrowse
      module-title="Daftar PKWT"
      module-subtitle="Data kontrak PKWT"
      endpoint="/pkwt"
      :columns="[
        { key: 'Nomor', label: 'Nomor' },
        { key: 'Tanggal', label: 'Tanggal', type: 'date' },
        { key: 'NIK', label: 'NIK' },
        { key: 'Nama', label: 'Nama' },
        { key: 'Jabatan', label: 'Jabatan' },
        { key: 'Departmen', label: 'Departemen' },
        { key: 'Unit', label: 'Unit' },
        { key: 'StatusPKWT', label: 'Status' },
        { key: 'TglMulai', label: 'Tgl Mulai', type: 'date' },
        { key: 'TglAkhir', label: 'Tgl Akhir', type: 'date' },
      ]"
      has-period
      :default-start="firstOfMonth"
      search-placeholder="Cari nomor, NIK, nama..."
      primary-key="Nomor"
      add-label="Tambah PKWT"
      add-form-path="/transaksi/pkwt/form"
      edit-form-path="/transaksi/pkwt/form"
      printable
      :per-page="15"
      @print="openCetak"
    />
    <CetakPkwtDialog ref="cetakDialogRef" :item="cetakItem" />
  </div>
</template>
