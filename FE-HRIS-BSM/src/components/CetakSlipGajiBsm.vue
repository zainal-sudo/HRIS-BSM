<script setup lang="ts">
/**
 * Cetak slip gaji BSM — duplikasi laporan "Gajian" di form Delphi
 * ufrmProsesGaji (D:\program\hrd bsm) untuk server kedua.
 *
 * Rincian mengikuti kolom tgajibulanan: gapok, tunjangan jabatan,
 * tunjangan kompetensi, tunjangan absensi, lalu seluruh potongan
 * (potongan jabatan, BPJS, bpjs ketenagakerjaan, koperasi, angsuran,
 * terlambat, potong hari, tidak masuk, PPh21) dan total gaji.
 *
 * Satu slip per halaman A4, bisa cetak banyak sekaligus.
 * PDF ditulis sebagai teks vektor (kecil, tajam dicetak).
 */

export interface SlipGajiBsmItem {
  nik: string;
  nama: string;
  jabatan: string;
  unit?: string;
  gapok: number;
  tkompetensi: number;
  tjabatan: number;
  potjabatan: number;
  tabsensi: number;
  bpjs: number;
  bpjstk: number;
  koperasi: number;
  tidakmasuk: number;
  terlambat: number;
  potonghari: number;
  angsuran: number;
  pph21: number;
  potTerlambat?: number;
  potHarikerja?: number;
  potTidakmasuk?: number;
  potongan?: number;
  rekening?: string;
  total: number;
}

import { jsPDF } from "jspdf";

const props = defineProps<{
  rows: SlipGajiBsmItem[];
  periode: number;
  tahun: number;
}>();

const BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const fmt = (n: number | string | null | undefined, dec = 0): string => {
  const v = Number(n);
  if (isNaN(v)) return "0";
  return v.toLocaleString("id-ID", { minimumFractionDigits: dec, maximumFractionDigits: dec });
};

/** Angka -> kata bahasa Indonesia (setara fungsi terbilang() di database Delphi) */
const SATUAN = ["", "Satu", "Dua", "Tiga", "Empat", "Lima", "Enam", "Tujuh", "Delapan", "Sembilan", "Sepuluh", "Sebelas"];
const gabung = (x: string, y: string): string => (y ? `${x} ${y}` : x);
function sebut(v: number): string {
  if (v < 12) return SATUAN[v];
  if (v < 20) return sebut(v - 10) + " Belas";
  if (v < 100) return gabung(sebut(Math.floor(v / 10)) + " Puluh", sebut(v % 10));
  if (v < 200) return gabung("Seratus", sebut(v - 100));
  if (v < 1000) return gabung(sebut(Math.floor(v / 100)) + " Ratus", sebut(v % 100));
  if (v < 2000) return gabung("Seribu", sebut(v - 1000));
  if (v < 1000000) return gabung(sebut(Math.floor(v / 1000)) + " Ribu", sebut(v % 1000));
  if (v < 1000000000) return gabung(sebut(Math.floor(v / 1000000)) + " Juta", sebut(v % 1000000));
  if (v < 1000000000000) return gabung(sebut(Math.floor(v / 1000000000)) + " Miliar", sebut(v % 1000000000));
  return gabung(sebut(Math.floor(v / 1000000000000)) + " Triliun", sebut(v % 1000000000000));
}
function terbilang(n: number | string | null | undefined): string {
  const s = sebut(Math.floor(Math.abs(Number(n) || 0)));
  return s === "" ? "Nol" : s;
}

const esc = (s: unknown): string =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Pecah rincian sama seperti rumus Delphi (dasar & potongan) */
function rincian(r: SlipGajiBsmItem) {
  const gapok = Number(r.gapok) || 0;
  const tjabatan = Number(r.tjabatan) || 0;
  const potjabatan = Number(r.potjabatan) || 0;
  const tkompetensi = Number(r.tkompetensi) || 0;
  const tabsensi = Number(r.tabsensi) || 0;
  const potTerlambat = Number(r.potTerlambat) || (Number(r.terlambat) || 0) * 5000;
  const potHarikerja =
    Number(r.potHarikerja) || ((Number(r.potonghari) || 0) * (gapok + (tjabatan - potjabatan) + tabsensi)) / 25;
  const potTidakmasuk =
    Number(r.potTidakmasuk) || ((Number(r.tidakmasuk) || 0) * tabsensi) / 25;
  return {
    gapok,
    potTerlambat,
    potHarikerja,
    potTidakmasuk,
    dasar: gapok + (tjabatan - potjabatan) + tkompetensi + tabsensi,
    total: Number(r.total) || 0,
  };
}

const rowHtml = (r: SlipGajiBsmItem): string => {
  const namaBulan = BULAN[props.periode - 1] || String(props.periode);
  const d = new Date();
  const tgl = `${d.getDate()} ${BULAN[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
  const x = rincian(r);

  const baris = (k: string, v: string, cls = "") =>
    `<div class="box-row"><span class="k">${k}</span><span class="c">:</span><span class="v ${cls}">${v}</span></div>`;

  return `
    <div class="slip">
      <div class="pt">
        PT. BUMI SARANA MAJU
        <span>${esc(namaBulan)} ${esc(props.tahun)}</span>
      </div>
      <div class="ttl">SLIP GAJI</div>

      <div class="box">
        ${baris("BULAN", esc(namaBulan))}
        ${baris("TAHUN", esc(props.tahun))}
        ${baris("NAMA", esc(r.nama))}
        ${baris("JABATAN", esc(r.jabatan))}
        ${baris("UNIT", esc(r.unit))}
        ${baris("NO. REKENING", esc(r.rekening))}
      </div>

      <div class="box">
        ${baris("GAJI POKOK", fmt(r.gapok))}
        ${baris("TUNJANGAN JABATAN", fmt(r.tjabatan))}
        ${baris("TUNJANGAN KOMPETENSI", fmt(r.tkompetensi))}
        ${baris("TUNJANGAN ABSENSI", fmt(r.tabsensi))}
        ${baris("POTONGAN JABATAN", fmt(r.potjabatan))}
        ${baris("BPJS KESEHATAN", fmt(r.bpjs))}
        ${baris("BPJS KETENAGAKERJAAN", fmt(r.bpjstk))}
        ${baris("KOPERASI", fmt(r.koperasi))}
        ${baris("ANGSURAN", fmt(r.angsuran))}
        ${baris("POTONGAN TERLAMBAT", fmt(x.potTerlambat))}
        ${baris("POTONGAN HARI KERJA", fmt(x.potHarikerja))}
        ${baris("POTONGAN TIDAK MASUK", fmt(x.potTidakmasuk))}
        ${baris("PPh 21", fmt(r.pph21))}
      </div>

      <div class="box total">
        ${baris("TOTAL PENGHASILAN", fmt(x.dasar), "t")}
        ${baris("TOTAL POTONGAN", fmt(Number(r.potongan) || 0))}
        ${baris("TOTAL GAJI", fmt(x.total), "t")}
      </div>

      <div class="box">
        ${baris("TERBILANG", esc(terbilang(x.total)) + " Rupiah", "tb")}
      </div>

      <div class="ttd">
        <div>Surakarta, ${tgl}</div>
        <div class="nama">${esc(r.nama)}</div>
      </div>
    </div>`;
};

const generateHtml = (list: SlipGajiBsmItem[], autoPrint = true): string =>
  `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Slip Gaji BSM</title><style>
      @page { size: A4 portrait; margin: 12mm 14mm; }
      * { box-sizing: border-box; }
      body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; color: #000; margin: 0; }
      .slip { width: 118mm; margin: 0 auto; page-break-after: always; }
      .slip:last-child { page-break-after: auto; }
      .pt { text-align: center; font-size: 12pt; font-weight: 700; margin-bottom: 1mm; }
      .pt span { display: block; font-size: 10pt; font-weight: 400; }
      .ttl { text-align: center; font-size: 14pt; font-weight: 700; text-decoration: underline; margin: 2mm 0 4mm; }
      .box { border: 1.2pt solid #000; margin-bottom: 4mm; }
      .box-row { display: flex; padding: 1.2mm 3mm; }
      .box-row .k { width: 52mm; flex: none; }
      .box-row .c { width: 5mm; flex: none; }
      .box-row .v { flex: 1; }
      .box.total .v.t { font-weight: 700; font-size: 12.5pt; }
      .box-row .v.tb { font-style: italic; }
      .ttd { width: 62mm; margin: 8mm 0 0 auto; text-align: center; font-size: 10.5pt; }
      .ttd .nama { margin-top: 16mm; font-weight: 700; text-decoration: underline; }
    </style></head><body>
      ${list.map(rowHtml).join("\n")}
      ${autoPrint ? `<${"script"}>
        window.onload = function () { setTimeout(function () { window.print() }, 250) }
      <${"/script"}>` : ""}
    </body></html>`;

function print(list?: SlipGajiBsmItem[]) {
  const target = (list && list.length ? list : props.rows) || [];
  if (target.length === 0) return false;
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) return false;
  win.document.write(generateHtml(target));
  win.document.close();
  return true;
}

/** Nama file PDF per karyawan, sama seperti Delphi: NIK_MMYYYY.pdf */
function pdfName(r: SlipGajiBsmItem): string {
  const nik = String(r.nik || "nonik").trim().replace(/[\\/:*?"<>|]/g, "");
  return `${nik}_${String(props.periode).padStart(2, "0")}${props.tahun}.pdf`;
}

/**
 * Render satu slip ke PDF teks vektor (kecil, puluhan KB, tajam dicetak)
 * dan kembalikan blob + nama file (tanpa mengunduh, supaya pemanggil
 * bisa menyimpannya sendiri, mis. langsung ke folder lokal).
 */
async function renderPdfBlob(r: SlipGajiBsmItem): Promise<{ blob: Blob; filename: string }> {
  const namaBulan = BULAN[props.periode - 1] || String(props.periode);
  const d = new Date();
  const tgl = `${d.getDate()} ${BULAN[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
  const x = rincian(r);

  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const X = 15;
  const W = 180;
  const kX = X + 3;
  const cX = X + 55;
  const vX = X + 63;
  const vLebar = X + W - 3 - vX;
  let y = 14;

  // Kepala perusahaan
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.text("PT. BUMI SARANA MAJU", 105, y + 3, { align: "center" });
  y += 6;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.text(`${namaBulan} ${props.tahun}`, 105, y + 3, { align: "center" });
  y += 8;

  // Judul
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.text("SLIP GAJI", 105, y + 6, { align: "center" });
  const jw = pdf.getTextWidth("SLIP GAJI");
  pdf.line(105 - jw / 2, y + 7.5, 105 + jw / 2, y + 7.5);
  y += 12;

  const baris = (
    k: string,
    v: string,
    opt?: { bold?: boolean; italic?: boolean; size?: number; h?: number }
  ) => {
    const h = opt?.h ?? 6.2;
    pdf.setFont("helvetica", opt?.bold ? "bold" : opt?.italic ? "italic" : "normal");
    pdf.setFontSize(opt?.size ?? 11);
    pdf.setTextColor(0, 0, 0);
    pdf.text(k, kX, y + 4.2);
    pdf.text(":", cX, y + 4.2);
    pdf.text(v, vX, y + 4.2);
    y += h;
  };

  const kotak = (isi: () => void) => {
    const y0 = y;
    isi();
    pdf.setDrawColor(0, 0, 0);
    pdf.setLineWidth(0.4);
    pdf.rect(X, y0, W, y - y0);
    y += 4;
  };

  kotak(() => {
    baris("BULAN", namaBulan);
    baris("TAHUN", String(props.tahun));
    baris("NAMA", String(r.nama || ""));
    baris("JABATAN", String(r.jabatan || ""));
    baris("UNIT", String(r.unit || ""));
    baris("NO. REKENING", String(r.rekening || ""));
  });

  kotak(() => {
    baris("GAJI POKOK", fmt(r.gapok));
    baris("TUNJANGAN JABATAN", fmt(r.tjabatan));
    baris("TUNJANGAN KOMPETENSI", fmt(r.tkompetensi));
    baris("TUNJANGAN ABSENSI", fmt(r.tabsensi));
    baris("POTONGAN JABATAN", fmt(r.potjabatan));
    baris("BPJS KESEHATAN", fmt(r.bpjs));
    baris("BPJS KETENAGAKERJAAN", fmt(r.bpjstk));
    baris("KOPERASI", fmt(r.koperasi));
    baris("ANGSURAN", fmt(r.angsuran));
    baris("POTONGAN TERLAMBAT", fmt(x.potTerlambat));
    baris("POTONGAN HARI KERJA", fmt(x.potHarikerja));
    baris("POTONGAN TIDAK MASUK", fmt(x.potTidakmasuk));
    baris("PPh 21", fmt(r.pph21));
  });

  kotak(() => {
    baris("TOTAL PENGHASILAN", fmt(x.dasar), { bold: true, h: 7 });
    baris("TOTAL POTONGAN", fmt(Number(r.potongan) || 0), { h: 7 });
    baris("TOTAL GAJI", fmt(x.total), { bold: true, size: 12.5, h: 7.5 });
  });

  kotak(() => {
    const kata = pdf.splitTextToSize(`${terbilang(x.total)} Rupiah`, vLebar);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(11);
    pdf.setTextColor(0, 0, 0);
    pdf.text("TERBILANG", kX, y + 4.2);
    pdf.text(":", cX, y + 4.2);
    pdf.setFont("helvetica", "italic");
    pdf.text(kata, vX, y + 4.2);
    y += Math.max(6.2, kata.length * 5 + 1.2);
  });

  // Tanda tangan (rata kanan)
  y += 4;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10.5);
  pdf.text(`Surakarta, ${tgl}`, 195, y, { align: "right" });
  y += 16;
  pdf.setFont("helvetica", "bold");
  pdf.text(String(r.nama || ""), 195, y, { align: "right" });
  const nw = pdf.getTextWidth(String(r.nama || ""));
  pdf.line(195 - nw, y + 1.5, 195, y + 1.5);

  return { blob: pdf.output("blob"), filename: pdfName(r) };
}

/**
 * Export satu slip ke PDF lewat unduhan browser biasa
 * (dipakai sebagai cadangan bila folder API tidak tersedia).
 */
async function exportPdfFile(r: SlipGajiBsmItem): Promise<string> {
  const { blob, filename } = await renderPdfBlob(r);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
  return filename;
}

defineExpose({ print, exportPdfFile, renderPdfBlob, pdfName });
</script>

<template></template>
