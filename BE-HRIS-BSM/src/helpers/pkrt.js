/**
 * Aturan & konstanta gaji PKRT (PT Entri Jaya Makmur PKRT, unit 20).
 *
 * Semua diturunkan dari kolom & rumus sel di file acuan
 * D:\PKRT sept 2026 Payroll.xlsx (sheet "all+rekap"):
 *
 *   H  THP               = D  + E + F + G
 *                         (GAPOK + T JABATAN + T KOMPETENSI + T MAKAN)
 *   J  rupiah lembur     = (1/173) * I * H
 *                         (poin lembur -> rupiah)
 *   L  nominal insentif  = K * 7000
 *                         (jml hari insentif shift malam)
 *   S  nominal pot gaji  = (R / 25) * H
 *                         (jml hari dipot)
 *   T  gaji              = H + J + L - M - N - O - P - Q - S
 *   U  gaji (bulat)      = ROUND(T, 0)
 *
 * Kolom M..Q (PPh21, BPJS Kesehatan, BPJS Ketenagakerjaan, Simpanan Kop,
 * Cicilan) TIDAK dihitung di sini: nilainya per karyawan dan disimpan di
 * tkaryawan lewat menu Master > Setting Gaji PKRT.
 */

/** Filter unit payroll PKRT (dipakai di SETELUH query modul ini). */
export const FILTER_UNIT_PKRT = "u.nm_unit LIKE '%PKRT%'"

/** Pembagi poin lembur: rupiah lembur = poin / 173 * THP */
export const PEMBAGI_POIN_LEMBUR = 173

/** Pembagi potong hari: nominal pot gaji = jml hari dipot / 25 * THP */
export const PEMBAGI_POT_HARI = 25

/** Tarif per hari untuk insentif shift malam */
export const INSENTIF_SHIFT_PER_HARI = 7000

/** Ubah apa pun jadi angka, nilai kosong/rusak -> 0 */
export const num = (v) => {
    const n = Number(v)
    return isNaN(n) ? 0 : n
}

/**
 * Hitung THP, lembur, insentif, potongan & gaji satu baris.
 * Dipakai server (GET data tersimpan, validasi saat simpan) maupun
 * disalin persis di frontend agar grid dan server tidak beda.
 *
 * Kolom yang dipakai: gapok, tjabatan, tkompetensi, tmakan, poin,
 * hariinsentif, haripotong, pph21, bpjskesehatan, bpjstk,
 * simpankoperasi, cicilan.
 */
export function hitungGajiPkrt(r) {
    const gapok = num(r.gapok)
    const tjabatan = num(r.tjabatan)
    const tkompetensi = num(r.tkompetensi)
    const tmakan = num(r.tmakan)

    const thp = gapok + tjabatan + tkompetensi + tmakan

    const lembur = (num(r.poin) / PEMBAGI_POIN_LEMBUR) * thp
    const insentif = num(r.hariinsentif) * INSENTIF_SHIFT_PER_HARI
    const nominalpotgaji = (num(r.haripotong) / PEMBAGI_POT_HARI) * thp

    const potongan =
        num(r.pph21) +
        num(r.bpjskesehatan) +
        num(r.bpjstk) +
        num(r.simpankoperasi) +
        num(r.cicilan) +
        nominalpotgaji

    const gaji = thp + lembur + insentif - potongan

    return {
        thp,
        lembur,
        insentif,
        nominalpotgaji,
        potongan,
        gaji,
        gajibulat: Math.round(gaji),
    }
}
