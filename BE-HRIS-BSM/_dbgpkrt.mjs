import pool from "./src/config/database.js"
import { hitungGajiPkrt } from "./src/helpers/pkrt.js"

const r = {
    nik: "20011900001", nama: "Vicky Chandra Lukmana", jabatan: "Operator Produksi",
    unit: "PT Entri Jaya Makmur PKRT", rekening: "7340417377", email: "",
    gapok: 2000000, tjabatan: 250000, tkompetensi: 0, tmakan: 314313,
    poin: 3, hariinsentif: 2, haripotong: 1,
    pph21: 0, bpjskesehatan: 25700, bpjstk: 51400, simpankoperasi: 100000, cicilan: 0,
}
console.log("hitung =", hitungGajiPkrt(r))

const conn = await pool.getConnection()
try {
    await conn.beginTransaction()
    await conn.query("DELETE FROM tgajibulananpkrt WHERE gb_periode = 1 AND gb_tahun = 2099")
    const h = hitungGajiPkrt(r)
    await conn.query(
        `INSERT INTO tgajibulananpkrt
      (gb_periode, gb_tahun, gb_nik, gb_nama, gb_jabatan, gb_unit, gb_rekening, gb_email,
       gb_gapok, gb_tunjanganjabatan, gb_tunjangankompetensi, gb_tunjanganmakan, gb_thp,
       gb_poin, gb_lembur, gb_hariinsentif, gb_insentif, gb_pph21, gb_bpjskesehatan,
       gb_bpjstk, gb_simpankoperasi, gb_cicilan, gb_haripotong, gb_nominalpotgaji,
       gb_potongan, gb_gaji, gb_gajibulat, gb_tanggal)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [1, 2099, r.nik, r.nama, r.jabatan, r.unit, r.rekening, r.email,
            r.gapok, r.tjabatan, r.tkompetensi, r.tmakan, h.thp,
            r.poin, h.lembur, r.hariinsentif, h.insentif, r.pph21, r.bpjskesehatan,
            r.bpjstk, r.simpankoperasi, r.cicilan, r.haripotong, h.nominalpotgaji,
            h.potongan, h.gaji, h.gajibulat, new Date()]
    )
    const [back] = await conn.query(
        "SELECT gb_nik, gb_gapok, gb_thp, gb_lembur, gb_gaji, gb_gajibulat FROM tgajibulananpkrt WHERE gb_periode=1 AND gb_tahun=2099")
    console.log("tersimpan =", JSON.stringify(back))
    await conn.rollback()
} finally {
    conn.release()
    process.exit(0)
}
