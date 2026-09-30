<script setup lang="ts">
/**
 * Cetak slip gaji PKRT — mengikuti susunan kolom file acuan
 * D:\PKRT sept 2026 Payroll.xlsx (sheet "all+rekap").
 *
 * Urutan baris slip sama seperti kolom Excel:
 *   Penghasilan  : GAPOK, Tunjangan Jabatan, Tunjangan Kompetensi,
 *                  Tunjangan Makan, (Total = THP), Rupiah Lembur,
 *                  Insentif Shift Malam
 *   Potongan     : PPh21, BPJS Kesehatan, BPJS Ketenagakerjaan,
 *                  Simpanan Kop, Cicilan, Potong Gaji
 *   Hasil        : (Total Potongan), GAJI
 *
 * Satu slip per halaman A4, bisa cetak banyak sekaligus.
 * PDF ditulis sebagai teks vektor (kecil, tajam dicetak).
 */

export interface SlipGajiPkrtItem {
  nik: string;
  nama: string;
  jabatan: string;
  unit?: string;
  rekening?: string;
  gapok: number;
  tjabatan: number;
  tkompetensi: number;
  tmakan: number;
  poin?: number;
  lembur?: number;
  hariinsentif?: number;
  insentif?: number;
  pph21: number;
  bpjskesehatan: number;
  bpjstk: number;
  simpankoperasi: number;
  cicilan: number;
  haripotong?: number;
  nominalpotgaji?: number;
  potongan?: number;
  gaji?: number;
  gajibulat?: number;
}

import { jsPDF } from "jspdf";

const props = defineProps<{
  rows: SlipGajiPkrtItem[];
  periode: number;
  tahun: number;
}>();

const PERUSAHAAN = "PT. ENTRI JAYA MAKMUR";

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

/** Pecah rincian dengan rumus yang sama seperti server (src/helpers/pkrt.js) */
function rincian(r: SlipGajiPkrtItem) {
  const n = (v: unknown) => {
    const x = Number(v);
    return isNaN(x) ? 0 : x;
  };
  const gapok = n(r.gapok);
  const tjabatan = n(r.tjabatan);
  const tkompetensi = n(r.tkompetensi);
  const tmakan = n(r.tmakan);

  const thp = gapok + tjabatan + tkompetensi + tmakan;
  const lembur = Number(r.lembur) || (n(r.poin) / 173) * thp;
  const insentif = Number(r.insentif) || n(r.hariinsentif) * 7000;
  const nominalpotgaji = Number(r.nominalpotgaji) || (n(r.haripotong) / 25) * thp;

  const potongan =
    n(r.pph21) + n(r.bpjskesehatan) + n(r.bpjstk) +
    n(r.simpankoperasi) + n(r.cicilan) + nominalpotgaji;

  const gaji = Number(r.gaji) || (thp + lembur + insentif - potongan);

  return {
    thp,
    lembur,
    insentif,
    nominalpotgaji,
    potongan: Number(r.potongan) || potongan,
    gaji,
    gajibulat: Number(r.gajibulat) || Math.round(gaji),
  };
}

const rowHtml = (r: SlipGajiPkrtItem): string => {
  const namaBulan = BULAN[props.periode - 1] || String(props.periode);
  const d = new Date();
  const tgl = `${d.getDate()} ${BULAN[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
  const x = rincian(r);

  const baris = (k: string, v: string, cls = "") =>
    `<div class="box-row"><span class="k">${k}</span><span class="c">:</span><span class="v ${cls}">${v}</span></div>`;

  return `
    <div class="slip">
      <div class="pt">
        ${esc(PERUSAHAAN)}
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
        ${baris("TUNJANGAN MAKAN", fmt(r.tmakan))}
        ${baris("LEMBUR", fmt(x.lembur))}
        ${baris("INSENTIF SHIFT MALAM", fmt(x.insentif))}
        ${baris("PPh 21", fmt(r.pph21))}
        ${baris("BPJS KESEHATAN", fmt(r.bpjskesehatan))}
        ${baris("BPJS KETENAGAKERJAAN", fmt(r.bpjstk))}
        ${baris("SIMPANAN KOPERASI", fmt(r.simpankoperasi))}
        ${baris("CICILAN", fmt(r.cicilan))}
        ${baris("POTONG GAJI", fmt(x.nominalpotgaji))}
      </div>

      <div class="box total">
        ${baris("TOTAL PENGHASILAN (THP)", fmt(x.thp), "t")}
        ${baris("TOTAL POTONGAN", fmt(x.potongan))}
        ${baris("TOTAL GAJI", fmt(x.gaji), "t")}
      </div>

      <div class="box">
        ${baris("TERBILANG", esc(terbilang(x.gajibulat)) + " Rupiah", "tb")}
      </div>

      <div class="ttd">
        <div>Solo, ${tgl}</div>
        <div class="nama">${esc(r.nama)}</div>
      </div>
    </div>`;
};

const generateHtml = (list: SlipGajiPkrtItem[], autoPrint = true): string =>
  `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Slip Gaji PKRT</title><style>
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
      .box-row .k { width: 56mm; flex: none; }
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

function print(list?: SlipGajiPkrtItem[]) {
  const target = (list && list.length ? list : props.rows) || [];
  if (target.length === 0) return false;
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) return false;
  win.document.write(generateHtml(target));
  win.document.close();
  return true;
}

/** Nama file PDF per karyawan, sama seperti Delphi: NIK_MMYYYY.pdf */
function pdfName(r: SlipGajiPkrtItem): string {
  const nik = String(r.nik || "nonik").trim().replace(/[\\/:*?"<>|]/g, "");
  return `${nik}_${String(props.periode).padStart(2, "0")}${props.tahun}.pdf`;
}

/**
 * Render satu slip ke PDF teks vektor (kecil, puluhan KB, tajam dicetak)
 * dan kembalikan blob + nama file (tanpa mengunduh, supaya pemanggil
 * bisa menyimpannya sendiri, mis. langsung ke folder lokal).
 */
async function renderPdfBlob(r: SlipGajiPkrtItem): Promise<{ blob: Blob; filename: string }> {
  const namaBulan = BULAN[props.periode - 1] || String(props.periode);
  const d = new Date();
  const tgl = `${d.getDate()} ${BULAN[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
  const x = rincian(r);

  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const X = 15;
  const W = 180;
  const kX = X + 3;
  const cX = X + 60;
  const vX = X + 68;
  const vLebar = X + W - 3 - vX;
  let y = 14;

  // Kepala perusahaan
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.text(PERUSAHAAN, 105, y + 3, { align: "center" });
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
    baris("TUNJANGAN MAKAN", fmt(r.tmakan));
    baris("LEMBUR", fmt(x.lembur));
    baris("INSENTIF SHIFT MALAM", fmt(x.insentif));
    baris("PPh 21", fmt(r.pph21));
    baris("BPJS KESEHATAN", fmt(r.bpjskesehatan));
    baris("BPJS KETENAGAKERJAAN", fmt(r.bpjstk));
    baris("SIMPANAN KOPERASI", fmt(r.simpankoperasi));
    baris("CICILAN", fmt(r.cicilan));
    baris("POTONG GAJI", fmt(x.nominalpotgaji));
  });

  kotak(() => {
    baris("TOTAL PENGHASILAN (THP)", fmt(x.thp), { bold: true, h: 7 });
    baris("TOTAL POTONGAN", fmt(x.potongan), { h: 7 });
    baris("TOTAL GAJI", fmt(x.gaji), { bold: true, size: 12.5, h: 7.5 });
  });

  kotak(() => {
    const kata = pdf.splitTextToSize(`${terbilang(x.gajibulat)} Rupiah`, vLebar);
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
  pdf.text(`Solo, ${tgl}`, 195, y, { align: "right" });
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
async function exportPdfFile(r: SlipGajiPkrtItem): Promise<string> {
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
