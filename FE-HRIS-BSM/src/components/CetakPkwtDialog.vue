<script setup lang="ts">
import { ref } from "vue";
import { useToast } from "vue-toastification";
import MsIcon from "@/components/MsIcon.vue";

const LOGO_PATH = "/logo-bsm.png";

const props = defineProps<{ item: Record<string, any> | null }>();
const emit = defineEmits<{ (e: "close"): void }>();
const dialogVisible = ref(false);
const toast = useToast();

const open = () => {
  dialogVisible.value = true;
};
const close = () => {
  dialogVisible.value = false;
  emit("close");
};

const formatDateIndo = (val: any): string => {
  if (!val) return "";
  const d = new Date(val);
  const months = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
  ];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
};

const getTtl = (): string => {
  const tempat = props.item?.TempatLahir || "";
  const tgl = props.item?.TglLahir ? formatDateIndo(props.item.TglLahir) : "";
  if (tempat && tgl) return `${tempat}, ${tgl}`;
  return tempat || tgl || "";
};

const getMasaKontrak = (): string => {
  const mulai = props.item?.TglMulai ? new Date(props.item.TglMulai) : null;
  const akhir = props.item?.TglAkhir ? new Date(props.item.TglAkhir) : null;
  if (!mulai || !akhir) return "";
  const diffMonths =
    (akhir.getFullYear() - mulai.getFullYear()) * 12 + (akhir.getMonth() - mulai.getMonth());
  return `${diffMonths} bulan`;
};

/* -------------------------------------------------------------------------- */
/* ISI PASAL — persis kata demi kata dari template docx (TIDAK DIUBAH)        */
/* -------------------------------------------------------------------------- */

const getPasalData = () => {
  const item = props.item;
  const jabatan = item?.Jabatan || "Kru Toko";
  const masa = getMasaKontrak();
  const tglMulai = item?.TglMulai ? formatDateIndo(item.TglMulai) : "";
  const tglAkhir = item?.TglAkhir ? formatDateIndo(item.TglAkhir) : "";

  return [
    {
      title: "Pasal 1",
      items: [
        {
          text: `PIHAK PERTAMA memberi tugas kepada PIHAK KEDUA sebagai ${jabatan}.`,
          subs: [
            "Selama masa berlakunya ikatan perjanjian kerja ini PIHAK KEDUA tidak dibenarkan kerja rangkap diperusahaan lain manapun juga dengan mengemukakan dalih atau alasan apapun juga.",
            "PIHAK KEDUA maupun keluarganya dilarang mempunyai usaha pribadi/keluarga yang sejenis dengan perusahaan, melakukan pelanggaran tentang ini otomatis karyawan mengundurkan diri dari perusahaan.",
          ],
        },
        {
          text: "Tentang pelanggaran aturan disiplin kerja :",
          subs: [
            "Apabila PIHAK KEDUA melakukan pelanggaran disiplin kerja yang berlaku pada PIHAK PERTAMA, PIHAK PERTAMA berhak memberikan sanksi sesuai tingkat kesalahan/pelanggaran yang dilakukan oleh PIHAK KEDUA berdasarkan peraturan yang berlaku, dapat berupa skorsing, PHK atau hukuman dalam bentuk lain.",
            "Dalam hal terjadi fraud maka akan dilaporkan kepada pihak yang berwajib.",
            "Apabila PIHAK KEDUA (II) melanggar peraturan yang ditentukan PIHAK PERTAMA (I) maka PIHAK PERTAMA (I) berhak membatalkan Kesepakatan Kerja ini secara sepihak tanpa ada tuntutan dari PIHAK KEDUA (II).",
          ],
        },
      ],
    },
    {
      title: "Pasal 2",
      items: [
        {
          text: "Hak PIHAK PERTAMA:",
          subs: [
            "PIHAK PERTAMA berhak menetapkan besaran upah sesuai prestasi kerja PIHAK KEDUA dan kemampuan keuangan perusahaan.",
            "PIHAK PERTAMA berhak untuk mendapatkan keterangan dari PIHAK KEDUA yang sebenarnya, baik mengenai dirinya maupun pekerjaannya kepada yang berwenang dalam hubungan dengan tugasnya.",
            "PIHAK PERTAMA berhak memberikan tugas/pekerjaan kepada PIHAK KEDUA dan menempatkan karyawan di wilayah kerja perusahaan (seluruh Indonesia).",
            "PIHAK PERTAMA berhak untuk menuntut prestasi yang terbaik dari setiap PIHAK KEDUA nya.",
            "PIHAK PERTAMA mempunyai kebebasan untuk menerapkan sistem-sistem, tekhnik-teknik dan metode-metode serta kebijakan-kebijakan untuk meningkatkan usaha dan menetapkan tata-tertib kerja.",
            "PIHAK PERTAMA berhak melakukan pemotongan gaji apabila PIHAK KEDUA tidak masuk kerja tanpa pemberitahuan apapun kepada PIHAK PERTAMA, dan PIHAK PERTAMA akan melakukan pemotongan gaji jika PIHAK KEDUA datang terlambat atau ijin tidak masuk dan belum memiliki cuti tahunan.",
          ],
        },
        {
          text: "Kewajiban PIHAK PERTAMA",
          subs: [
            "PIHAK PERTAMA wajib memberikan upah sesuai dengan prestasi kerja PIHAK KEDUA dan kemampuan keuangan perusahaan.",
            "PIHAK PERTAMA wajib mentaati melaksanakan peraturan yang telah dibuat.",
            "PIHAK PERTAMA wajib memperhatikan kesejahteraan PIHAK KEDUA dan wajib memberikan hak-hak PIHAK KEDUA sesuai dengan ketetapan PIHAK PERTAMA.",
          ],
        },
      ],
    },
    {
      title: "Pasal 3",
      items: [
        {
          text: "Hak PIHAK KEDUA :",
          subs: [
            "PIHAK KEDUA berhak mendapatkan upah sesuai dengan prestasi kerja PIHAK KEDUA dan kemampuan keuangan perusahaan.",
          ],
        },
        {
          text: "Kewajiban PIHAK KEDUA :",
          subs: [
            "PIHAK KEDUA wajib mematuhi seluruh isi peraturan perusahaan serta aturan-aturan lain yang berlaku di perusahaan dan siap ditempatkan/dipindahtugaskan di wilayah kerja perusahaan (seluruh Indonesia).",
            "PIHAK KEDUA wajib memberikan keterangan yang sebenarnya, baik mengenai dirinya maupun kerjanya kepada yang berwenang dalam hubungan dengan tugasnya.",
            "PIHAK KEDUA wajib melaksanakan pekerjaan yang diinstruksikan oleh perusahaan kepadanya dengan sebaik-baiknya dan mentaati perintah atasan dengan penuh rasa tanggung jawab.",
            "PIHAK KEDUA wajib untuk memberikan prestasi kerja yang terbaik untuk perusahaan serta menjamin kerahasiaan perusahaan.",
            "PIHAK KEDUA wajib memberitahukan jika tidak masuk kerja kepada PIHAK PERTAMA.",
          ],
        },
      ],
    },
    {
      title: "Pasal 4",
      items: [
        {
          text: `Perjanjian kerja ini berlaku untuk masa paling lama ${masa} terhitung mulai tanggal ${tglMulai} sampai dengan tanggal ${tglAkhir}.`,
          subs: [],
        },
        {
          text: "Setelah berakhirnya jangka waktu tertentu perjanjian ini dapat diperpanjang dan akan di atur dalam perjanjian yang terpisah.",
          subs: [],
        },
        {
          text: "Sewaktu-waktu Perjanjian kerja ini berakhir apabila :",
          subs: [
            "PIHAK KEDUA mengundurkan diri dengan persetujuan PIHAK PERTAMA Sebelum masa berakhirnya Perjanjian Kerja ini. Prosedur pengunduran diri adalah pengajuan secara tertulis 30 hari sebelum mengundurkan diri, apabila syarat tersebut tidak dipenuhi maka Pihak Kedua dikenai kewajiban membayar denda sebesar gaji yang diterima pada bulan tersebut.",
            "PIHAK KEDUA melakukan pelanggaran berat.",
            "Tidak masuk kerja selama 5 (lima) hari berturut-turut tanpa keterangan tertulis atau alasan yang sah yang dibenarkan.",
            "PIHAK KEDUA berdasarkan penilaian dinyatakan tidak mampu menjalankan/melaksanakan tugas dan kewajiban dalam pekerjaan baik sebelum atau setelah masa perjanjian selesai, dan PIHAK PERTAMA tidak berkewajiban untuk memberi penggantian apapun PIHAK KEDUA dan PIHAK KEDUA tidak akan menuntut secara hukum.",
            "PIHAK KEDUA meninggal dunia.",
          ],
        },
      ],
    },
    {
      title: "Pasal 5",
      items: [
        {
          text: "Apabila dikemudian hari terdapat hal-hal yang tidak atau belum tercakup dalam perjanjian kerja ini, maka perjanjian kerja ini akan diperbaharui dengan menambahkan pasal-pasal yang diperlukan sebagaimana mestinya.",
          subs: [],
        },
        {
          text: "Demikian Perjanjian Kerja ini dibuat dan ditandatangani oleh PIHAK PERTAMA dan PIHAK KEDUA, pada hari dan tanggal tersebut di bawah ini dalam keadaan sehat rohani dan jasmani, tanpa paksaan dan ancaman apapun juga.",
          subs: [],
        },
      ],
    },
  ];
};

const LETTERS = ["a", "b", "c", "d", "e", "f", "g", "h"];

const generateHtml = (): string => {
  const item = props.item;
  const ttl = getTtl();
  const today = formatDateIndo(item?.TglMulai || new Date());
  const pasalData = getPasalData();

  const renderPasal = (pasal: { title: string; items: { text: string; subs: string[] }[] }) => {
    let html = `<p class="pasal">${pasal.title}</p>`;
    pasal.items.forEach((it, i) => {
      html += `<div class="list-item"><span class="num">${i + 1}.</span><span class="txt">${it.text}</span></div>`;
      it.subs.forEach((s, j) => {
        html += `<div class="list-subitem"><span class="letter">${LETTERS[j]}.</span><span class="txt">${s}</span></div>`;
      });
    });
    return html;
  };

  const bodyHtml = `
        <div class="doc-title">PERJANJIAN KERJA UNTUK WAKTU TERTENTU</div>
        <div class="doc-nomor">No. : ${item?.Nomor || ""}</div>

        <p class="content">Yang bertanda tangan di bawah ini :</p>
        <p class="content">Dalam hal ini karena jabatannya untuk bertindak dan atas nama ${item?.unit2 || ""}, selanjutnya disebut sebagai <span class="bold">PIHAK PERTAMA (I)</span></p>
        <div class="field-row"><div class="field-label">Nama</div><div class="field-colon">:</div><div class="field-value">${item?.Nama || ""}</div></div>
        <div class="field-row"><div class="field-label">Tempat/Tgl. Lahir</div><div class="field-colon">:</div><div class="field-value">${ttl}</div></div>
        <div class="field-row"><div class="field-label">Alamat</div><div class="field-colon">:</div><div class="field-value">${item?.Alamat || ""}</div></div>
        <p class="content">Bertindak untuk dan atas namanya sendiri selanjutnya disebut sebagai <span class="bold">PIHAK KEDUA (II)</span></p>
        <p class="content">PIHAK PERTAMA dan PIHAK KEDUA sepakat melakukan Perjanjian Kerja untuk jangka waktu tertentu dengan ketentuan sebagai berikut :</p>

        ${pasalData.map(renderPasal).join("\n")}

        <p class="sign-city">Surakarta, ${today}</p>
        <table class="ttd-table">
            <tr>
                <td><div class="bold">PIHAK PERTAMA</div><div class="ttd-space"></div><div class="bold">Heri Purnomo</div></td>
                <td><div class="bold">PIHAK KEDUA</div><div class="ttd-space"></div><div class="bold">${item?.Nama || ""}</div></td>
            </tr>
        </table>`;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title></title><style>
        @page { size: 215.9mm 330.2mm; margin: 1cm 2cm 1cm 2cm; }
        * { box-sizing: border-box; }
        body { font-family: Arial, sans-serif; font-size: 10pt; line-height: 1.15; color: #000; margin: 0; }
        .page-wrap { width: 100%; border-collapse: collapse; }
        .page-wrap > thead { display: table-header-group; }
        .page-wrap > tbody { display: table-row-group; }
        .page-wrap td { padding: 0; }
        .header-spacer td { padding-bottom: 14pt; }
        .body-cell { padding-top: 2pt; }
        .doc-title { text-align: center; font-size: 10pt; font-weight: bold; margin: 10pt 0 2pt 0; }
        .doc-nomor { text-align: center; font-size: 10pt; margin-bottom: 10pt; }
        .content { text-align: justify; text-indent: 1.25cm; margin: 0 0 4pt 0; }
        .field-row { display: flex; margin: 0 0 2pt 0; }
        .field-label { width: 3.2cm; flex-shrink: 0; }
        .field-colon { width: 0.4cm; flex-shrink: 0; }
        .field-value { flex: 1; }
        .pasal { text-align: center; margin: 10pt 0 4pt 0; font-weight: bold; }
        .list-item { display: flex; text-align: justify; margin: 3pt 0 3pt 0.6cm; }
        .list-item .num { width: 0.9cm; flex-shrink: 0; }
        .list-item .txt { flex: 1; }
        .list-subitem { display: flex; text-align: justify; margin: 3pt 0 3pt 1.4cm; }
        .list-subitem .letter { width: 0.7cm; flex-shrink: 0; }
        .list-subitem .txt { flex: 1; }
        .bold { font-weight: bold; }
        .ttd-table { width: 100%; border-collapse: collapse; margin-top: 10pt; }
        .ttd-table td { width: 50%; text-align: center; vertical-align: top; padding: 0 10pt; border: none; font-size: 10pt; }
        .ttd-space { height: 60pt; position: relative; }
        .sign-city { text-align: left; margin: 10pt 0 0 0; font-size: 10pt; }
    </style></head><body>
        <table class="page-wrap">
            <thead class="header-spacer"></thead>
            <tbody>
                <tr><td class="body-cell">${bodyHtml}</td></tr>
            </tbody>
        </table>
        <${"script"}>
            window.onload = function () {
                setTimeout(function () { window.print() }, 200)
            }
        <${"/script"}>
    </body></html>`;
};

const printSurat = () => {
  const html = generateHtml();
  const win = window.open("", "_blank", "width=1000,height=700");
  if (win) {
    win.document.write(html);
    win.document.close();
  }
  close();
};

/* ================================================================ */
/* ===========================  DOCX  ============================== */
/* ================================================================ */

const FONT = "Arial";
const HEADER_FONT = "Cambria";
const SIZE = 20; // 10pt

const downloadDocx = async () => {
  try {
    const docxLib: any = await import("docx");
    const {
      Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
      WidthType, AlignmentType, VerticalMergeType, VerticalAlign,
      TabStopType, BorderStyle, PageNumber,
    } = docxLib;

    const item = props.item;
    const ttl = getTtl();
    const today = formatDateIndo(item?.TglMulai || new Date());
    const pasalData = getPasalData();

    const border = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
    const bordered = { top: border, bottom: border, left: border, right: border };

    let logoBuffer: ArrayBuffer | null = null;
    try {
      const res = await fetch(LOGO_PATH);
      if (res.ok) logoBuffer = await res.arrayBuffer();
    } catch {
      /* logo opsional */
    }

    const run = (text: string, opts: any = {}) =>
      new TextRun({ text, font: FONT, size: SIZE, ...opts });

    const bodyPara = (text: string, opts: any = {}) =>
      new Paragraph({
        children: [run(text)],
        alignment: AlignmentType.JUSTIFIED,
        spacing: { before: 0, after: 60 },
        ...opts,
      });

    const fieldPara = (label: string, value: string) =>
      new Paragraph({
        tabStops: [{ type: TabStopType.LEFT, position: 1701 }],
        spacing: { before: 0, after: 40 },
        children: [run(`${label}\t: ${value}`)],
      });

    const pasalHeading = (title: string) =>
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 200, after: 100 },
        children: [run(title, { bold: true })],
      });

    const numberedItem = (num: number, text: string) =>
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        indent: { left: 360, hanging: 360 },
        spacing: { before: 60, after: 60 },
        children: [run(`${num}.\t${text}`)],
      });

    const letterItem = (letter: string, text: string) =>
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        indent: { left: 720, hanging: 360 },
        spacing: { before: 60, after: 60 },
        children: [run(`${letter}.\t${text}`)],
      });

    const pasalParagraphs: any[] = [];
    pasalData.forEach((pasal) => {
      pasalParagraphs.push(pasalHeading(pasal.title));
      pasal.items.forEach((it, i) => {
        pasalParagraphs.push(numberedItem(i + 1, it.text));
        it.subs.forEach((s, j) => {
          pasalParagraphs.push(letterItem(LETTERS[j], s));
        });
      });
    });

    const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
    const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

    const ttdCell = (title: string, name: string) => {
      const children: any[] = [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 0 },
          children: [run(title, { bold: true })],
        }),
        new Paragraph({ text: "", spacing: { before: 600 } }),
        new Paragraph({ text: "", spacing: { before: 300 } }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [run(name, { bold: true })] }),
      ];
      return new TableCell({ borders: noBorders, children });
    };

    const ttdTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: noBorders,
      rows: [
        new TableRow({
          children: [ttdCell("PIHAK PERTAMA", "Heri Purnomo"), ttdCell("PIHAK KEDUA", item?.Nama || "")],
        }),
      ],
    });

    void bordered;
    void VerticalMergeType;
    void VerticalAlign;
    void PageNumber;

    const doc = new Document({
      sections: [
        {
          properties: {
            page: {
              size: { width: 12191, height: 18711 },
              margin: { top: 1123, bottom: 562, left: 1138, right: 1138, header: 158, footer: 720 },
            },
          },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 100, after: 40 },
              children: [run("PERJANJIAN KERJA UNTUK WAKTU TERTENTU", { bold: true })],
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 200 },
              children: [run(`No. : ${item?.Nomor || ""}`)],
            }),
            bodyPara("Yang bertanda tangan di bawah ini :", { indent: { firstLine: 567 } }),
            bodyPara(
              `Dalam hal ini karena jabatannya untuk bertindak dan atas nama ${item?.unit2 || ""}, selanjutnya disebut sebagai PIHAK PERTAMA (I)`
            ),
            fieldPara("Nama", item?.Nama || ""),
            fieldPara("Tempat/Tgl. Lahir", ttl),
            fieldPara("Alamat", item?.Alamat || ""),
            bodyPara(
              "Bertindak untuk dan atas namanya sendiri selanjutnya disebut sebagai PIHAK KEDUA (II)"
            ),
            bodyPara(
              "PIHAK PERTAMA dan PIHAK KEDUA sepakat melakukan Perjanjian Kerja untuk jangka waktu tertentu dengan ketentuan sebagai berikut :",
              { spacing: { after: 200 } }
            ),
            ...pasalParagraphs,
            new Paragraph({ text: "", spacing: { before: 200 } }),
            new Paragraph({ spacing: { after: 300 }, children: [run(`Surakarta, ${today}`)] }),
            ttdTable,
          ],
        },
      ],
    });

    void logoBuffer;

    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `PKWT_${item?.Nama || "Karyawan"}.docx`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("DOCX berhasil didownload");
    close();
  } catch (e) {
    console.error(e);
    toast.error("Gagal membuat DOCX");
  }
};

defineExpose({ open, close });
</script>

<template>
  <v-dialog v-model="dialogVisible" max-width="420" persistent>
    <v-card rounded="false">
      <v-card-item class="py-3">
        <div class="d-flex align-center">
          <span class="material-symbols-outlined" style="color: #3b5998; margin-right: 8px">print</span>
          <v-card-title class="text-body-1 font-weight-bold pa-0">Cetak PKWT</v-card-title>
        </div>
        <div class="cetak-sub">Cetak surat PKWT{{ item?.Nama ? ` — ${item.Nama}` : "" }}</div>
      </v-card-item>
      <v-card-text class="pt-0">
        <div class="cetak-options">
          <button class="cetak-option" @click="downloadDocx">
            <span class="option-icon docx"><MsIcon name="description" :size="20" /></span>
            <span class="option-text"><strong>Simpan DOCX</strong><small>Download file Word</small></span>
            <MsIcon name="chevron_right" :size="16" />
          </button>
          <button class="cetak-option" @click="printSurat">
            <span class="option-icon print"><MsIcon name="print" :size="20" /></span>
            <span class="option-text"><strong>Print Langsung</strong><small>Cetak via browser</small></span>
            <MsIcon name="chevron_right" :size="16" />
          </button>
        </div>
      </v-card-text>
      <v-card-actions class="pa-4 pt-2">
        <v-spacer />
        <v-btn variant="text" color="grey-darken-2" @click="close">Tutup</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.cetak-sub {
  font-size: 11.5px;
  color: #6b7a90;
  margin-top: 2px;
}
.cetak-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.cetak-option {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--ds-border, #b0b8c4);
  background: #fff;
  cursor: pointer;
  font-family: "Plus Jakarta Sans", sans-serif;
  text-align: left;
  width: 100%;
}
.cetak-option:hover {
  border-color: var(--ds-primary, #3b5998);
  background: #eef2f9;
}
.option-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.option-icon.docx {
  background: #dbeafe;
  color: #2563eb;
}
.option-icon.print {
  background: #dcfce7;
  color: #16a34a;
}
.option-text {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.option-text strong {
  font-size: 13px;
  color: var(--ds-on-surface, #1b2d4a);
}
.option-text small {
  font-size: 11px;
  color: #6b7a90;
}
</style>
