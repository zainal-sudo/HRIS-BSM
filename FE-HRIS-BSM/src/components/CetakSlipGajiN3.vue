<script setup lang="ts">
/**
 * Cetak slip gaji N3 — duplikasi laporan "Gajian" (report/gajian.fr3)
 * di form Delphi ufrmProsesGaji D:\program\hrd N3.
 *
 * Susunan persis contoh cetakan PT Entri Jaya Makmur:
 *  PENGHASILAN: gapok, transport, tunj. jabatan, tunj. kompetensi,
 *    lembur (poin x satuan), tunj. makan, TOTAL PENGHASILAN
 *  POTONGAN: simpanan wajib (=koperasi), angsuran koperasi (=angsuran),
 *    BPJS kesehatan, BPJS tenaga kerja, punishment (=terlambat*5000),
 *    hari kerja, tidak masuk, PPh 21, TOTAL POTONGAN
 *  GAJI YANG DITRANSFER, Simpanan Pokok, Sisa Angsuran.
 *
 * Satu slip per halaman A4, bisa cetak banyak sekaligus.
 * PDF ditulis sebagai teks vektor (kecil, tajam dicetak).
 */

export interface SlipGajiN3Item {
  nik: string;
  nama: string;
  jabatan: string;
  unit?: string;
  gapok: number;
  tkompetensi: number;
  tjabatan: number;
  tmakan: number;
  transport: number;
  poin: number;
  lembur?: number;
  bpjs: number;
  bpjstk: number;
  koperasi: number;
  tidakmasuk: number;
  terlambat: number;
  potonghari: number;
  angsuran: number;
  pph21: number;
  simpananpokok?: number;
  sisaangsuran?: number;
  potTerlambat?: number;
  potHarikerja?: number;
  potTidakmasuk?: number;
  potongan?: number;
  total: number;
}

import { jsPDF } from "jspdf";

const props = defineProps<{
  rows: SlipGajiN3Item[];
  periode: number;
  tahun: number;
}>();

const BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];
const BULAN3 = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

const fmt = (n: number | string | null | undefined, dec = 0): string => {
  const v = Number(n);
  if (isNaN(v)) return "0";
  if (dec > 0) {
    // Poin ala Delphi (%2.2n, titik desimal): 35.83
    const t = v.toFixed(dec).split(".");
    return `${Number(t[0]).toLocaleString("id-ID")}.${t[1]}`;
  }
  return v.toLocaleString("id-ID", { maximumFractionDigits: 0 });
};

const esc = (s: unknown): string =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Pecah rincian sama seperti rumus Delphi N3 */
function rincian(r: SlipGajiN3Item) {
  const gapok = Number(r.gapok) || 0;
  const tjabatan = Number(r.tjabatan) || 0;
  const tkompetensi = Number(r.tkompetensi) || 0;
  const tmakan = Number(r.tmakan) || 0;
  const transport = Number(r.transport) || 0;
  const poin = Number(r.poin) || 0;
  const lembur = Number(r.lembur) || (poin * (gapok + tjabatan + tmakan + transport)) / 173;
  const potTerlambat = Number(r.potTerlambat) || (Number(r.terlambat) || 0) * 5000;
  const potHarikerja =
    Number(r.potHarikerja) ||
    ((Number(r.potonghari) || 0) * (gapok + tjabatan + tmakan + transport + tkompetensi)) / 25;
  const potTidakmasuk =
    Number(r.potTidakmasuk) || ((Number(r.tidakmasuk) || 0) * (tmakan + transport)) / 25;
  return {
    gapok,
    tjabatan,
    tkompetensi,
    tmakan,
    transport,
    poin,
    lembur,
    potTerlambat,
    potHarikerja,
    potTidakmasuk,
    dasar: gapok + tjabatan + tkompetensi + tmakan + transport + lembur,
    potongan: Number(r.potongan) || 0,
    total: Number(r.total) || 0,
  };
}

const rowHtml = (r: SlipGajiN3Item): string => {
  const namaBulan = BULAN[props.periode - 1] || String(props.periode);
  const d = new Date();
  const tgl = `${d.getDate()} ${BULAN3[d.getMonth()]} ${d.getFullYear()}`;
  const x = rincian(r);

  const hRow = (k: string, jml: string, satuan: string, total: string) =>
    `<tr><td>${k}</td><td class="r">${jml}</td><td class="c">${satuan}</td><td class="r">${total}</td></tr>`;
  const pRow = (k: string, v: string) =>
    `<tr><td>${k}</td><td class="r">${v}</td></tr>`;

  return `
    <div class="slip">
      <div class="kop">
        <div class="kop-left">
          <div class="pt">Pt Entri Jaya Makmur</div>
          <div class="addr">Jl. Ring Road No.95, Mojosongo, Kec. Jebres, Kota<br>Surakarta, Jawa Tengah</div>
        </div>
        <div class="logo"><div class="logo-n3">N3</div><div class="logo-entri">ENTRI</div></div>
      </div>
      <div class="ttl">SLIP GAJI</div>

      <div class="info">
        <div class="info-row"><span class="k">NIK</span><span class="c">:</span><span>${esc(r.nik)}</span></div>
        <div class="info-row"><span class="k">NAMA KARYAWAN</span><span class="c">:</span><span>${esc(r.nama)}</span></div>
        <div class="info-row"><span class="k">CABANG</span><span class="c">:</span><span>${esc(r.unit || "PT Entri Jaya Makmur")}</span></div>
        <div class="info-row"><span class="k">PERIODE</span><span class="c">:</span><span>${esc(namaBulan)} - ${esc(props.tahun)}</span></div>
      </div>

      <div class="sec">PENGHASILAN</div>
      <table class="tbl">
        <thead><tr><th>KETERANGAN</th><th>JUMLAH</th><th>SATUAN</th><th>TOTAL</th></tr></thead>
        <tbody>
          ${hRow("GAJI POKOK", "", "", fmt(x.gapok))}
          ${hRow("TUNJ. TRANSPORT", "", "", fmt(x.transport))}
          ${hRow("TUNJ. JABATAN", "", "", fmt(x.tjabatan))}
          ${hRow("TUNJ. KOMPETENSI", "", "", fmt(x.tkompetensi))}
          ${hRow("LEMBUR", fmt(x.poin, 2), x.poin ? "Poin" : "", fmt(Math.round(x.lembur)))}
          ${hRow("TUNJ. MAKAN", "", "", fmt(x.tmakan))}
        </tbody>
      </table>
      <table class="tbl tot"><tbody>
        <tr><td>TOTAL PENGHASILAN</td><td class="r">${fmt(Math.round(x.dasar))}</td></tr>
      </tbody></table>

      <div class="sec">POTONGAN</div>
      <table class="tbl">
        <thead><tr><th>KETERANGAN</th><th>NOMINAL</th></tr></thead>
        <tbody>
          ${pRow("SIMPANAN WAJIB", fmt(r.koperasi))}
          ${pRow("ANGSURAN KOPERASI", fmt(r.angsuran))}
          ${pRow("BPJS KESEHATAN", fmt(r.bpjs))}
          ${pRow("BPJS TENAGA KERJA", fmt(r.bpjstk))}
          ${pRow("PUNISHMENT", fmt(Math.round(x.potTerlambat)))}
          ${pRow("HARI KERJA", fmt(Math.round(x.potHarikerja)))}
          ${pRow("TIDAK MASUK", fmt(Math.round(x.potTidakmasuk)))}
          ${pRow("PPh 21", fmt(r.pph21))}
        </tbody>
      </table>
      <table class="tbl tot"><tbody>
        <tr><td>TOTAL POTONGAN</td><td class="r">${fmt(Math.round(x.potongan))}</td></tr>
      </tbody></table>
      <table class="tbl tot"><tbody>
        <tr><td>GAJI YANG DI TRANSFER</td><td class="r">${fmt(Math.round(x.total))}</td></tr>
      </tbody></table>
      <table class="tbl plain"><tbody>
        <tr><td>Simpanan Pokok</td><td class="r">${fmt(r.simpananpokok)}</td></tr>
        <tr><td>Sisa Angsuran</td><td class="r">${fmt(r.sisaangsuran)}</td></tr>
      </tbody></table>

      <div class="ttd">
        <div>Surakarta, ${tgl}</div>
        <div class="nama">${esc(r.nama)}</div>
      </div>
    </div>`;
};

const generateHtml = (list: SlipGajiN3Item[], autoPrint = true): string =>
  `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Slip Gaji N3</title><style>
      @page { size: A4 portrait; margin: 12mm 14mm; }
      * { box-sizing: border-box; }
      body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; color: #000; margin: 0; }
      .slip { width: 150mm; margin: 0 auto; page-break-after: always; }
      .slip:last-child { page-break-after: auto; }
      .kop { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2mm; }
      .pt { font-size: 13pt; font-weight: 700; }
      .addr { font-size: 9.5pt; margin-top: 1mm; }
      .logo { text-align: center; line-height: 1; }
      .logo-n3 { background: #1fa3a3; color: #fff; font-weight: 800; font-size: 20pt; padding: 1mm 4mm; letter-spacing: 1px; }
      .logo-entri { background: #e8722a; color: #fff; font-weight: 800; font-size: 10pt; padding: 0.8mm 2mm; letter-spacing: 3px; }
      .ttl { text-align: center; font-size: 14pt; font-weight: 700; text-decoration: underline; margin: 3mm 0; }
      .info { margin-bottom: 2mm; }
      .info-row { display: flex; padding: 0.4mm 0; }
      .info-row .k { width: 34mm; flex: none; }
      .info-row .c { width: 5mm; flex: none; }
      .sec { background: #cfcfcf; border: 1pt solid #000; font-weight: 700; padding: 1mm 2mm; }
      .tbl { width: 100%; border-collapse: collapse; border: 1pt solid #000; margin-bottom: 2mm; }
      .tbl th { background: #cfcfcf; border: 1pt solid #000; padding: 1mm 2mm; font-size: 9.5pt; }
      .tbl td { border: 1pt solid #000; padding: 1mm 2mm; }
      .tbl .r { text-align: right; }
      .tbl .c { text-align: center; }
      .tbl.tot td { background: #cfcfcf; font-weight: 700; }
      .tbl.tot td + td { width: 38mm; }
      .tbl.plain { border: none; }
      .tbl.plain td { border: none; padding: 0.6mm 2mm; }
      .tbl.plain td + td { width: 38mm; text-align: right; }
      .ttd { width: 62mm; margin: 6mm 0 0 auto; text-align: center; font-size: 10pt; }
      .ttd .nama { margin-top: 14mm; font-weight: 700; text-decoration: underline; }
    </style></head><body>
      ${list.map(rowHtml).join("\n")}
      ${autoPrint ? `<${"script"}>
        window.onload = function () { setTimeout(function () { window.print() }, 250) }
      <${"/script"}>` : ""}
    </body></html>`;

function print(list?: SlipGajiN3Item[]) {
  const target = (list && list.length ? list : props.rows) || [];
  if (target.length === 0) return false;
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) return false;
  win.document.write(generateHtml(target));
  win.document.close();
  return true;
}

/** Nama file PDF per karyawan, sama seperti Delphi: NIK_MMYYYY.pdf */
function pdfName(r: SlipGajiN3Item): string {
  const nik = String(r.nik || "nonik").trim().replace(/[\\/:*?"<>|]/g, "");
  return `${nik}_${String(props.periode).padStart(2, "0")}${props.tahun}.pdf`;
}

/**
 * Render satu slip ke PDF teks vektor (kecil, tajam dicetak)
 * dan kembalikan blob + nama file (tanpa mengunduh, supaya pemanggil
 * bisa menyimpannya sendiri).
 */
async function renderPdfBlob(r: SlipGajiN3Item): Promise<{ blob: Blob; filename: string }> {
  const namaBulan = BULAN[props.periode - 1] || String(props.periode);
  const d = new Date();
  const tgl = `${d.getDate()} ${BULAN3[d.getMonth()]} ${d.getFullYear()}`;
  const x = rincian(r);

  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const X = 15;
  const W = 180;
  const R = X + W; // tepi kanan
  let y = 12;

  // Kop: nama + alamat kiri, logo kanan
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.text("Pt Entri Jaya Makmur", X, y + 4);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9.5);
  pdf.text("Jl. Ring Road No.95, Mojosongo, Kec. Jebres, Kota", X, y + 9);
  pdf.text("Surakarta, Jawa Tengah", X, y + 13);
  // Logo N3 ENTRI (vektor)
  pdf.setFillColor(31, 163, 163);
  pdf.rect(R - 30, y - 1, 30, 13, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(15);
  pdf.text("N3", R - 15, y + 8.5, { align: "center" });
  pdf.setFillColor(232, 114, 42);
  pdf.rect(R - 30, y + 12, 30, 7, "F");
  pdf.setFontSize(8.5);
  pdf.text("ENTRI", R - 15, y + 17, { align: "center" });
  pdf.setTextColor(0, 0, 0);
  y += 22;

  // Judul
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.text("SLIP GAJI", 105, y + 4, { align: "center" });
  const jw = pdf.getTextWidth("SLIP GAJI");
  pdf.line(105 - jw / 2, y + 5.5, 105 + jw / 2, y + 5.5);
  y += 10;

  const info = (k: string, v: string) => {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text(k, X, y);
    pdf.text(":", X + 36, y);
    pdf.text(String(v ?? ""), X + 42, y);
    y += 5;
  };
  info("NIK", String(r.nik || ""));
  info("NAMA KARYAWAN", String(r.nama || ""));
  info("CABANG", String(r.unit || "PT Entri Jaya Makmur"));
  info("PERIODE", `${namaBulan} - ${props.tahun}`);
  y += 2;

  // Tabel berpenghasilan / berpotongan: kolom teks kiri + angka kanan
  const vX = R - 3; // angka rata kanan
  const secBar = (label: string) => {
    pdf.setFillColor(207, 207, 207);
    pdf.rect(X, y, W, 7, "FD");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.text(label, X + 2, y + 5);
    y += 7;
  };
  const headRow = (cols: { t: string; w: number; align?: "left" | "center" | "right" }[]) => {
    pdf.setFillColor(207, 207, 207);
    pdf.rect(X, y, W, 6, "FD");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9.5);
    let cx = X + 2;
    for (const c of cols) {
      const a = c.align || "left";
      pdf.text(c.t, a === "right" ? cx + c.w - 2 : a === "center" ? cx + c.w / 2 : cx, y + 4.2, { align: a });
      cx += c.w;
    }
    y += 6;
  };
  const val = (v: string) => {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text(v, vX, y + 4.2, { align: "right" });
  };
  const mid = (v: string, mx: number, align: "center" | "right" = "center") => {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text(v, mx, y + 4.2, { align });
  };
  // batas kolom PENGHASILAN: ket(0-96) jumlah(96-128) satuan(128-146) total(146-180)
  const hRow = (k: string, jml: string, satuan: string, total: string) => {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text(k, X + 2, y + 4.2);
    mid(jml, X + 112, "right");
    mid(satuan, X + 137, "center");
    val(total);
    y += 6;
  };
  const pRow = (k: string, v: string) => {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text(k, X + 2, y + 4.2);
    val(v);
    y += 6;
  };
  const totRow = (k: string, v: string) => {
    pdf.setFillColor(207, 207, 207);
    pdf.rect(X, y, W, 6.5, "FD");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.text(k, X + 2, y + 4.5);
    pdf.text(v, vX, y + 4.5, { align: "right" });
    y += 6.5;
  };
  const frame = (y0: number) => {
    pdf.setDrawColor(0, 0, 0);
    pdf.setLineWidth(0.4);
    pdf.rect(X, y0, W, y - y0);
  };

  secBar("PENGHASILAN");
  let y0 = y;
  headRow([
    { t: "KETERANGAN", w: 96 },
    { t: "JUMLAH", w: 32, align: "right" },
    { t: "SATUAN", w: 18, align: "center" },
    { t: "TOTAL", w: 34, align: "right" },
  ]);
  hRow("GAJI POKOK", "", "", fmt(x.gapok));
  hRow("TUNJ. TRANSPORT", "", "", fmt(x.transport));
  hRow("TUNJ. JABATAN", "", "", fmt(x.tjabatan));
  hRow("TUNJ. KOMPETENSI", "", "", fmt(x.tkompetensi));
  hRow("LEMBUR", fmt(x.poin, 2), x.poin ? "Poin" : "", fmt(Math.round(x.lembur)));
  hRow("TUNJ. MAKAN", "", "", fmt(x.tmakan));
  frame(y0);
  y += 2;
  y0 = y;
  totRow("TOTAL PENGHASILAN", fmt(Math.round(x.dasar)));
  frame(y0);
  y += 3;

  secBar("POTONGAN");
  y0 = y;
  headRow([
    { t: "KETERANGAN", w: 140 },
    { t: "NOMINAL", w: 40, align: "right" },
  ]);
  pRow("SIMPANAN WAJIB", fmt(r.koperasi));
  pRow("ANGSURAN KOPERASI", fmt(r.angsuran));
  pRow("BPJS KESEHATAN", fmt(r.bpjs));
  pRow("BPJS TENAGA KERJA", fmt(r.bpjstk));
  pRow("PUNISHMENT", fmt(Math.round(x.potTerlambat)));
  pRow("HARI KERJA", fmt(Math.round(x.potHarikerja)));
  pRow("TIDAK MASUK", fmt(Math.round(x.potTidakmasuk)));
  pRow("PPh 21", fmt(r.pph21));
  frame(y0);
  y += 2;
  y0 = y;
  totRow("TOTAL POTONGAN", fmt(Math.round(x.potongan)));
  frame(y0);
  y += 2;
  y0 = y;
  totRow("GAJI YANG DI TRANSFER", fmt(Math.round(x.total)));
  frame(y0);
  y += 3;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.text("Simpanan Pokok", X + 2, y);
  pdf.text(fmt(r.simpananpokok), vX, y, { align: "right" });
  y += 5.5;
  pdf.text("Sisa Angsuran", X + 2, y);
  pdf.text(fmt(r.sisaangsuran), vX, y, { align: "right" });
  y += 9;

  // Tanda tangan (rata kanan)
  pdf.setFontSize(10);
  pdf.text(`Surakarta, ${tgl}`, R, y, { align: "right" });
  y += 16;
  pdf.setFont("helvetica", "bold");
  pdf.text(String(r.nama || ""), R, y, { align: "right" });
  const nw = pdf.getTextWidth(String(r.nama || ""));
  pdf.line(R - nw, y + 1.5, R, y + 1.5);

  return { blob: pdf.output("blob"), filename: pdfName(r) };
}

/**
 * Export satu slip ke PDF lewat unduhan browser biasa
 * (dipakai sebagai cadangan bila folder API tidak tersedia).
 */
async function exportPdfFile(r: SlipGajiN3Item): Promise<string> {
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
