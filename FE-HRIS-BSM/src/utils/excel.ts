import JSZip from "jszip";

/**
 * Export tabel ke file .xlsx asli (Office Open XML) memakai JSZip yang
 * sudah menjadi dependensi proyek — tanpa menambah library baru.
 *
 * Nilai bertipe `number` ditulis sebagai sel angka Excel (bisa di-SUM),
 * sisanya sebagai teks (inline string) agar NIK / nomor dokumen yang
 * berawalan nol tidak rusak.
 */

export interface ExcelColumn {
  /** Judul kolom di baris header */
  label: string;
  /** Lebar kolom (satuan karakter Excel), opsional */
  width?: number;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function colLetter(idx: number): string {
  let s = "";
  let n = idx;
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

function cellXml(
  rowNum: number,
  colIdx: number,
  value: unknown,
  headerStyle: boolean
): string {
  const ref = `${colLetter(colIdx)}${rowNum}`;
  const style = headerStyle ? ` s="1"` : "";
  if (value === null || value === undefined || value === "") {
    return `<c r="${ref}"${style}/>`;
  }
  if (typeof value === "number" && isFinite(value)) {
    return `<c r="${ref}"${style}><v>${value}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"${style}><is><t>${escapeXml(
    String(value)
  )}</t></is></c>`;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

const WORKBOOK = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>`;

const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`;

/**
 * Unduh data tabular sebagai file .xlsx (satu sheet "Data").
 * @param columns judul (+ lebar opsional) tiap kolom
 * @param rows baris data; tiap baris array nilai sejajar `columns`
 * @param filename nama file, mis. "izin_2026-10-16.xlsx"
 */
export async function exportRowsToXlsx(
  columns: ExcelColumn[],
  rows: unknown[][],
  filename: string
): Promise<void> {
  const lines: string[] = [];
  // Header (bold via style s="1")
  lines.push(
    `<row r="1">${columns
      .map((c, i) => cellXml(1, i, c.label, true))
      .join("")}</row>`
  );
  rows.forEach((row, r) => {
    const rowNum = r + 2;
    lines.push(
      `<row r="${rowNum}">${columns
        .map((_, i) => cellXml(rowNum, i, row[i], false))
        .join("")}</row>`
    );
  });

  const cols = columns
    .map((c, i) => {
      const w = c.width || Math.min(Math.max(c.label.length + 4, 12), 40);
      return `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`;
    })
    .join("");

  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${cols}</cols><sheetData>${lines.join(
    ""
  )}</sheetData></worksheet>`;

  const zip = new JSZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES);
  zip.file("_rels/.rels", RELS);
  zip.file("xl/workbook.xml", WORKBOOK);
  zip.file("xl/_rels/workbook.xml.rels", WORKBOOK_RELS);
  zip.file("xl/styles.xml", STYLES);
  zip.file("xl/worksheets/sheet1.xml", sheet);

  const blob = await zip.generateAsync({
    type: "blob",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
