/**
 * Cek rumus gaji PKRT (src/helpers/pkrt.js) terhadap file acuan
 * D:\PKRT sept 2026 Payroll.xlsx -> sheet "all+rekap".
 *
 * Data acuan diambil dari _pkrt_acuan.json (hasil dump openpyxl ke
 * sheet "all+rekap": kolom D..U persis seperti di file Excel).
 * Kolom T (gaji) & U (gaji bulat) harus cocok 100%.
 */
import fs from "node:fs"
import { hitungGajiPkrt } from "./src/helpers/pkrt.js"

const acuan = JSON.parse(fs.readFileSync(new URL("./_pkrt_acuan.json", import.meta.url), "utf8"))
const n = (v) => (v === null || v === undefined || v === "" ? 0 : Number(v))

let banding = 0, cocokT = 0, cocokU = 0
const beda = []

for (const r of acuan) {
    if (!r.C) continue // baris rekap / judul, bukan karyawan
    banding++

    const h = hitungGajiPkrt({
        gapok: n(r.D),            // GAPOK
        tjabatan: n(r.E),         // T JABATAN
        tkompetensi: n(r.F),      // T KOMPETENSI
        tmakan: n(r.G),           // T MAKAN
        poin: n(r.I),             // poin
        hariinsentif: n(r.K),     // jml hari insentif shift mlm
        pph21: n(r.M),            // POT PPH21 bulanan
        bpjskesehatan: n(r.N),    // Pot. BPJS Kesehatan
        bpjstk: n(r.O),           // Pot. BPJS Ketenagakerjaan
        simpankoperasi: n(r.P),   // Simpanan Kop
        cicilan: n(r.Q),          // cicilan
        haripotong: n(r.R),       // jml hari dipot
    })

    // kolom H = THP, kolom S = nominal pot gaji (keduanya turunan)
    if (Math.abs(h.thp - n(r.H)) < 0.01) { /* THP ikutDicek di bawah */ }
    const thpOk = Math.abs(h.thp - n(r.H)) < 0.01
    const potOk = Math.abs(h.nominalpotgaji - n(r.S)) < 0.01
    const gajiOk = Math.abs(h.gaji - n(r.T)) < 0.01
    const bulatOk = h.gajibulat === n(r.U)

    if (gajiOk) cocokT++
    if (bulatOk) cocokU++
    if (!thpOk || !potOk || !gajiOk || !bulatOk) {
        beda.push(
            `  baris ${r.excelRow} ${r.B} (${r.C})` +
            (thpOk ? "" : ` THP excel=${n(r.H)} hitung=${h.thp}`) +
            (potOk ? "" : ` PotGaji excel=${n(r.S)} hitung=${h.nominalpotgaji}`) +
            (gajiOk ? "" : ` gaji excel=${n(r.T)} hitung=${h.gaji}`) +
            (bulatOk ? "" : ` bulat excel=${n(r.U)} hitung=${h.gajibulat}`)
        )
    }
}

console.log(`Baris karyawan dibaca     : ${banding}`)
console.log(`THP (kolom H) + PotGaji (S) + Gaji (T) + bulat (U) sebaris`)
console.log(`Gaji (kolom T) cocok      : ${cocokT}/${banding}`)
console.log(`Gaji bulat (kolom U) cocok: ${cocokU}/${banding}`)
if (beda.length) {
    console.log("Selisih:")
    beda.forEach((b) => console.log(b))
    process.exitCode = 1
} else {
    console.log("\nSEMUA COCOK dengan file acuan Excel.")
}
