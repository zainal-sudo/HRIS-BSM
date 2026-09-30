import pool from '../config/database.js'
import { success, error } from '../helpers/response.js'
import { smtpTransporter, kirimSlipPdf } from '../helpers/smtp.js'
import {
    FILTER_UNIT_PKRT,
    FILTER_JABATAN_GAJI_PKRT,
    hitungGajiPkrt,
    num,
} from '../helpers/pkrt.js'

/**
 * PROSES GAJI PKRT
 * Rujukan: D:\PKRT sept 2026 Payroll.xlsx (sheet "all+rekap").
 * Database: hrd server utama (103.103.22.7), tabel hasil = tgajibulananpkrt.
 *
 * Unit payroll: PT Entri Jaya Makmur PKRT (tunit.kd_unit = 20).
 *
 * Alur (mengikuti modul gaji BSM/N3/Roti yang sudah ada):
 *   1. Muat Karyawan -> master karyawan aktif PKRT + setting gaji dari
 *      tkaryawan (lihat settingGajiPkrtController)
 *   2. Tarik Absensi -> kolom "Jml Hari Dipot" dari procedure
 *      rekap_absensiv3 di server utama (Potong_Gaji)
 *   3. Muat Tersimpan -> data yang sudah ada di tgajibulananpkrt
 *   4. Simpan -> hapus periode tsb lalu insert ulang (1 transaksi)
 *
 * Semua rumus uang dihitung ulang di server (lihat helpers/pkrt.js) supaya
 * nilai yang tersimpan tidak bisa dimanipulasi dari grid frontend.
 */

/** Kolom setting yang ditarik dari tkaryawan saat Muat Karyawan */
const SELECT_KARYAWAN = `
        k.kar_nik AS nik,
        k.kar_nama AS nama,
        COALESCE(j.nm_jabat, '') AS jabatan,
        COALESCE(u.nm_unit, '') AS unit,
        COALESCE(k.kar_no_rekening, '') AS rekening,
        COALESCE(k.kar_email, '') AS email,
        COALESCE(k.kar_gaji_pokok, 0) AS gapok,
        COALESCE(k.kar_tunjangan_jabatan, 0) AS tjabatan,
        COALESCE(k.kar_tunjangan_kompetensi, 0) AS tkompetensi,
        COALESCE(k.kar_tunjangan_makan, 0) AS tmakan,
        COALESCE(k.kar_pph21, 0) AS pph21,
        COALESCE(k.kar_bpjs_kesehatan, 0) AS bpjskesehatan,
        COALESCE(k.kar_bpjs_ketenagakerjaan, 0) AS bpjstk,
        COALESCE(k.kar_simpanan_koperasi, 0) AS simpankoperasi,
        COALESCE(k.kar_cicilan, 0) AS cicilan`

/** Kolom yang disimpan ke tgajibulananpkrt (nama fisik di DB) */
const KOLOM_SIMPAN = [
    ['gapok', 'gb_gapok'],
    ['tjabatan', 'gb_tunjanganjabatan'],
    ['tkompetensi', 'gb_tunjangankompetensi'],
    ['tmakan', 'gb_tunjanganmakan'],
    ['thp', 'gb_thp'],
    ['poin', 'gb_poin'],
    ['lembur', 'gb_lembur'],
    ['hariinsentif', 'gb_hariinsentif'],
    ['insentif', 'gb_insentif'],
    ['pph21', 'gb_pph21'],
    ['bpjskesehatan', 'gb_bpjskesehatan'],
    ['bpjstk', 'gb_bpjstk'],
    ['simpankoperasi', 'gb_simpankoperasi'],
    ['cicilan', 'gb_cicilan'],
    ['haripotong', 'gb_haripotong'],
    ['nominalpotgaji', 'gb_nominalpotgaji'],
    ['potongan', 'gb_potongan'],
    ['gaji', 'gb_gaji'],
    ['gajibulat', 'gb_gajibulat'],
]

/** Bawa nilai uang satu baris ke bentuk final (THP, lembur, gaji, dst) */
function lengkapkan(r) {
    return { ...r, ...hitungGajiPkrt(r) }
}

function cekPeriode(periode, tahun, res) {
    if (!periode || periode < 1 || periode > 12) {
        error(res, 'Periode (bulan) tidak valid', 400)
        return false
    }
    if (!tahun || tahun < 2000 || tahun > 2100) {
        error(res, 'Tahun tidak valid', 400)
        return false
    }
    return true
}

/**
 * GET /api/gaji-pkrt/karyawan
 * Master karyawan aktif PKRT -> dasar grid proses gaji.
 * Nilai turunan (THP, lembur, potongan, gaji) ikut dikirim supaya grid
 * langsung menampilkan angka, tetap dihitung ulang server saat simpan.
 */
export const getKaryawanPkrt = async (req, res, next) => {
    try {
        const [rows] = await pool.query(
            `SELECT ${SELECT_KARYAWAN}
       FROM tkaryawan k
       LEFT JOIN tjabatan j ON j.kd_jabat = k.kar_kd_jabat
       LEFT JOIN tunit u ON u.kd_unit = k.kar_kd_unit
      WHERE k.kar_status_aktif = 1
        AND ${FILTER_UNIT_PKRT}
        AND ${FILTER_JABATAN_GAJI_PKRT}
      ORDER BY k.kar_nama`
        )

        const data = rows.map((r) => lengkapkan({ ...r, poin: 0, hariinsentif: 0, haripotong: 0 }))

        success(res, data, `${data.length} karyawan aktif unit PKRT dimuat`)

    } catch (err) {
        next(err)
    }
}

/**
 * GET /api/gaji-pkrt/absensi?start_date=&end_date=
 * Tarik rekap absensi dari procedure rekap_absensiv3 (server utama),
 * disaring hanya NIK unit PKRT. Yang dipakai untuk perhitungan gaji
 * PKRT hanya kolom "Jml Hari Dipot" (= Potong_Gaji); sisa kolom hanya
 * ditampilkan sebagai informasi.
 */
export const getAbsensiPkrt = async (req, res, next) => {
    try {
        const startDate = String(req.query.start_date || '').trim()
        const endDate = String(req.query.end_date || '').trim()

        if (!startDate || !endDate) {
            return error(res, 'Rentang tanggal absensi wajib diisi', 400)
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
            return error(res, 'Format tanggal harus YYYY-MM-DD', 400)
        }
        if (startDate > endDate) {
            return error(res, 'Tanggal awal tidak boleh melewati tanggal akhir', 400)
        }

        const [nikRows] = await pool.query(
            `SELECT k.kar_nik AS nik
       FROM tkaryawan k
       LEFT JOIN tunit u ON u.kd_unit = k.kar_kd_unit
WHERE k.kar_status_aktif = 1
         AND ${FILTER_UNIT_PKRT}
         AND ${FILTER_JABATAN_GAJI_PKRT}`
        )
        const nikPkrt = new Set(nikRows.map((r) => String(r.nik).trim()))

        // CALL pada mysql2 terbungkus satu level lebih dalam:
        // hasil = [ [ {baris...}, {okPacket} ] ]
        const [result] = await pool.query('CALL rekap_absensiv3(?, ?, ?)', [startDate, endDate, '%'])
        const semua = (Array.isArray(result?.[0]) ? result[0] : (Array.isArray(result) ? result : []))
            .filter((r) => r && nikPkrt.has(String(r.Nik).trim()))

        const rows = semua.map((r) => ({
            nik: String(r.Nik).trim(),
            nama: r.Nama || '',
            unit: r.Cabang || '',
            hari: num(r.Hari),
            masuk: num(r.Masuk),
            terlambat: num(r.Terlambat),
            tidakmasuk: num(r.CutiTahunan) + num(r.Sakit) + num(r.CutiKhusus),
            potonghari: num(r.Potong_Gaji),
            keterangan: r.Keterangan || '',
        }))

        const tanpaData = [...nikPkrt].filter((n) => !rows.some((r) => r.nik === n))

        success(res, {
            start_date: startDate,
            end_date: endDate,
            rows,
            jumlah: rows.length,
            tanpaData,
            totalNik: nikPkrt.size,
        }, `Rekap absensi ${rows.length} dari ${nikPkrt.size} karyawan PKRT` +
            (tanpaData.length > 0 ? `, ${tanpaData.length} karyawan tanpa data absensi` : ''))

    } catch (err) {
        next(err)
    }
}

/**
 * GET /api/gaji-pkrt?periode=&tahun=
 * Data gaji PKRT yang sudah tersimpan pada satu periode.
 */
export const getGajiPkrt = async (req, res, next) => {
    try {
        const periode = parseInt(req.query.periode)
        const tahun = parseInt(req.query.tahun)

        if (!cekPeriode(periode, tahun, res)) return

        const [rows] = await pool.query(
            `SELECT
        g.gb_nik AS nik,
        g.gb_nama AS nama,
        COALESCE(g.gb_jabatan, j.nm_jabat, '') AS jabatan,
        COALESCE(g.gb_unit, u.nm_unit, '') AS unit,
        COALESCE(g.gb_rekening, k.kar_no_rekening, '') AS rekening,
        COALESCE(g.gb_email, k.kar_email, '') AS email,
        COALESCE(g.gb_gapok, 0) AS gapok,
        COALESCE(g.gb_tunjanganjabatan, 0) AS tjabatan,
        COALESCE(g.gb_tunjangankompetensi, 0) AS tkompetensi,
        COALESCE(g.gb_tunjanganmakan, 0) AS tmakan,
        COALESCE(g.gb_poin, 0) AS poin,
        COALESCE(g.gb_hariinsentif, 0) AS hariinsentif,
        COALESCE(g.gb_pph21, 0) AS pph21,
        COALESCE(g.gb_bpjskesehatan, 0) AS bpjskesehatan,
        COALESCE(g.gb_bpjstk, 0) AS bpjstk,
        COALESCE(g.gb_simpankoperasi, 0) AS simpankoperasi,
        COALESCE(g.gb_cicilan, 0) AS cicilan,
        COALESCE(g.gb_haripotong, 0) AS haripotong
      FROM tgajibulananpkrt g
      LEFT JOIN tkaryawan k ON k.kar_nik = g.gb_nik
      LEFT JOIN tjabatan j ON j.kd_jabat = k.kar_kd_jabat
      LEFT JOIN tunit u ON u.kd_unit = k.kar_kd_unit
      WHERE g.gb_periode = ? AND g.gb_tahun = ?
        AND ${FILTER_JABATAN_GAJI_PKRT}
      ORDER BY g.gb_nik`,
            [periode, tahun]
        )

        const data = rows.map((r) => lengkapkan(r))

        success(res, {
            periode,
            tahun,
            rows: data,
            jumlah: data.length,
        }, data.length > 0
            ? `${data.length} data gaji PKRT tersimpan untuk periode ${periode}/${tahun}`
            : `Belum ada data gaji PKRT untuk periode ${periode}/${tahun}`)

    } catch (err) {
        next(err)
    }
}

/**
 * POST /api/gaji-pkrt/simpan
 * Simpan hasil proses: hapus dulu periode tsb, lalu insert ulang
 * dalam satu transaksi. Nilai uang dihitung ulang di server.
 */
export const simpanGajiPkrt = async (req, res, next) => {
    const conn = await pool.getConnection()

    try {
        const periode = parseInt(req.body?.periode)
        const tahun = parseInt(req.body?.tahun)
        const rows = Array.isArray(req.body?.rows) ? req.body.rows : []

        if (!cekPeriode(periode, tahun, res)) return

        const isi = rows.filter((r) => String(r?.nik || '').trim() !== '')
        if (isi.length === 0) {
            return error(res, 'Tidak ada data untuk disimpan', 400)
        }

        // Cegah NIK ganda dalam satu payload (kolomnya primary key)
        const nikUnique = new Set()
        for (const r of isi) {
            const nik = String(r.nik).trim()
            if (nikUnique.has(nik)) {
                return error(res, `NIK ${nik} muncul lebih dari sekali`, 400)
            }
            nikUnique.add(nik)
        }

        await conn.beginTransaction()

        await conn.query(
            'DELETE FROM tgajibulananpkrt WHERE gb_periode = ? AND gb_tahun = ?',
            [periode, tahun]
        )

        // Daftar kolom fisik untuk INSERT, dan daftar nilai yang disimpan:
        // kolom turunan (thp/lembur/insentif/potongan/gaji) selalu diambil dari
        // hasil hitung server, kolom input lain dari payload.
        const kolom = KOLOM_SIMPAN.map(([, db]) => db)
        const values = isi.map((r) => {
            const hitung = hitungGajiPkrt(r)
            const angka = KOLOM_SIMPAN.map(([alias]) =>
                hitung[alias] !== undefined ? hitung[alias] : num(r[alias])
            )
            return [
                periode,
                tahun,
                String(r.nik).trim(),
                String(r.nama || ''),
                String(r.jabatan || ''),
                String(r.unit || ''),
                String(r.rekening || ''),
                String(r.email || ''),
                ...angka,
                new Date(),
            ]
        })

        const CHUNK = 200
        for (let i = 0; i < values.length; i += CHUNK) {
            const slice = values.slice(i, i + CHUNK)
            const placeholders = slice.map(() => `(${new Array(slice[0].length).fill('?').join(', ')})`).join(', ')
            await conn.query(
                `INSERT INTO tgajibulananpkrt
          (gb_periode, gb_tahun, gb_nik, gb_nama, gb_jabatan, gb_unit,
           gb_rekening, gb_email, ${kolom.join(', ')}, gb_tanggal)
        VALUES ${placeholders}`,
                slice.flat()
            )
        }

        await conn.commit()

        success(res, { periode, tahun, jumlah: isi.length },
            `Gaji PKRT periode ${periode}/${tahun} berhasil disimpan (${isi.length} karyawan)`)

    } catch (err) {
        try { await conn.rollback() } catch { /* abaikan */ }
        next(err)
    } finally {
        conn.release()
    }
}

/**
 * GET /api/gaji-pkrt/smtp-test
 * Cek konfigurasi & koneksi SMTP tanpa mengirim email.
 */
export const tesSmtpPkrt = async (req, res, next) => {
    try {
        const transporter = smtpTransporter()
        if (!transporter) {
            return error(res, 'Konfigurasi SMTP belum diisi di server (SMTP_HOST/SMTP_USER/SMTP_PASS)', 500)
        }
        await transporter.verify()
        success(res, null, 'Koneksi SMTP OK, siap kirim email')
    } catch (err) {
        next(err)
    }
}

/**
 * POST /api/gaji-pkrt/kirim-slip
 * Kirim slip gaji (PDF) ke email satu karyawan.
 * Body: { nik, subject, message, filename, pdfBase64 }
 */
export const kirimSlipGajiPkrt = async (req, res, next) => {
    try {
        const nik = String(req.body?.nik || '').trim()
        const hasil = await kirimSlipPdf({
            pool,
            nik,
            subject: String(req.body?.subject || '').trim(),
            message: String(req.body?.message || ''),
            filename: String(req.body?.filename || `${nik || 'slip'}.pdf`),
            pdfBase64: String(req.body?.pdfBase64 || ''),
        })
        success(res, hasil, `Slip gaji terkirim ke ${hasil.email}`)
    } catch (err) {
        if (err.statusCode) return error(res, err.message, err.statusCode)
        next(err)
    }
}

export { hitungGajiPkrt }
