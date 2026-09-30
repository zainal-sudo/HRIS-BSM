/**
 * Helper masa kerja: ekspresi SQL "X thn Y bln Z hr" antara kolom tanggal
 * masuk dan CURDATE().
 *
 * Aritmetika KALENDER, bukan pendekatan "365 hari = 1 tahun / 30 hari = 1 bulan":
 *   totalBulan = TIMESTAMPDIFF(MONTH, masuk, CURDATE())
 *                MySQL/MariaDB sudah memperhitungkan hari dalam bulan & akhir
 *                bulan (mis. 31 Jan -> 1 Mar = 1 bulan, bukan 2), jadi TIDAK
 *                perlu dikoreksi lagi dengan DAY().
 *   tahun      = FLOOR(totalBulan / 12), bulan = totalBulan % 12
 *   hari       = DATEDIFF(CURDATE(), tanggal anniversary)
 *
 * Menghasilkan NULL bila kolom tanggal NULL (frontend menampilkan sel kosong).
 * Logikanya identik dengan `formatMasaKerja` di
 * FE-HRIS-BSM/src/utils/format.ts — kedua sisi diverifikasi dengan kasus uji
 * yang sama.
 *
 * @param {string} col ekspresi kolom tanggal, mis. 'a.kar_tgl_masuk'
 * @returns {string} ekspresi SQL
 */
export function masaKerjaSQL(col) {
    // GREATEST(0, ...) agar tanggal masuk yang masih di masa depan tidak
    // menghasilkan "thn"/"hr" negatif.
    const totalBulan = `GREATEST(TIMESTAMPDIFF(MONTH, ${col}, CURDATE()), 0)`
    const sisaHari = `GREATEST(DATEDIFF(CURDATE(), DATE_ADD(${col}, INTERVAL ${totalBulan} MONTH)), 0)`
    return `CONCAT(
        FLOOR(${totalBulan} / 12), ' thn ',
        MOD(${totalBulan}, 12), ' bln ',
        ${sisaHari}, ' hr'
      )`
}
