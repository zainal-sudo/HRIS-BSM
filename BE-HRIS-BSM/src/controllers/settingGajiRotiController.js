import pool from '../config/database.js'
import { success, error } from '../helpers/response.js'

/**
 * SETTING GAJI ROTI
 * Modul sederhana: hanya 2 kolom di tkaryawan yang diatur,
 *  - kar_gaji_pokok     : boleh diedit (gapok)
 *  - kar_gaji_per_hari  : READ ONLY, rumus kar_gaji_pokok / 26
 *
 * Karyawan yang ditampilkan = karyawan aktif unit RotiQ
 * (pola unit LIKE 'RotiQ%', sama dengan Proses Gaji Roti).
 */

/** Jumlah hari untuk rumus gaji per hari */
const HARI_BULAN = 26

/** Pembulatan dibulatkan ke rupiah penuh, sama seperti data yang tersimpan */
const hitungPerHari = (gapok) => Math.round(num(gapok) / HARI_BULAN)

/** Ubah apa pun jadi angka, nilai kosong/rusak -> 0 */
const num = (v) => {
    const n = Number(v)
    return isNaN(n) ? 0 : n
}

/**
 * GET /api/setting-gaji-roti/unit
 * Daftar unit RotiQ untuk dropdown filter.
 */
export const getUnitSettingGajiRoti = async (req, res, next) => {
    try {
        const [rows] = await pool.query(
            `SELECT kd_unit AS kode, nm_unit AS nama
       FROM tunit
       WHERE nm_unit LIKE 'RotiQ%'
       ORDER BY nm_unit`
        )
        success(res, rows)
    } catch (err) {
        next(err)
    }
}

/**
 * GET /api/setting-gaji-roti?unit=
 * Grid karyawan aktif unit RotiQ.
 * Gaji per hari selalu dikirim sesuai rumus (pokok / 26).
 */
export const getSettingGajiRoti = async (req, res, next) => {
    try {
        const unit = String(req.query.unit ?? '').trim()

        const params = []
        let filterUnit = ''
        if (unit) {
            filterUnit = 'AND k.kar_kd_unit = ?'
            params.push(unit)
        }

        const [rows] = await pool.query(
            `SELECT
        k.kar_nik AS nik,
        k.kar_nama AS nama,
        COALESCE(j.nm_jabat, '') AS jabatan,
        COALESCE(u.nm_unit, '') AS unit,
        COALESCE(k.kar_sistem_gaji, '') AS sistemgaji,
        COALESCE(k.kar_gaji_pokok, 0) AS gapok,
        COALESCE(ROUND(k.kar_gaji_pokok / ${HARI_BULAN}), 0) AS gajiperhari
      FROM tkaryawan k
      LEFT JOIN tjabatan j ON j.kd_jabat = k.kar_kd_jabat
      LEFT JOIN tunit u ON u.kd_unit = k.kar_kd_unit
      WHERE k.kar_status_aktif = 1
        AND u.nm_unit LIKE 'RotiQ%'
        ${filterUnit}
      ORDER BY u.nm_unit, k.kar_nama`,
            params
        )

        success(res, rows, `${rows.length} karyawan dimuat`)

    } catch (err) {
        next(err)
    }
}

/**
 * PUT /api/setting-gaji-roti
 * Simpan gapok; kar_gaji_per_hari dihitung ulang di server (tidak dibaca
 * dari payload) supaya kolom read only tidak bisa dimanipulasi.
 * Body: { rows: [{ nik, gapok }] }
 */
export const saveSettingGajiRoti = async (req, res, next) => {
    const conn = await pool.getConnection()

    try {
        const { rows } = req.body || {}

        if (!Array.isArray(rows) || rows.length === 0) {
            return error(res, 'Data rows tidak boleh kosong', 400)
        }

        const list = rows
            .filter((r) => r && String(r.nik ?? '').trim() !== '')
            .map((r) => ({
                nik: String(r.nik).trim(),
                gapok: num(r.gapok),
            }))

        if (list.length === 0) {
            return error(res, 'Tidak ada NIK valid untuk disimpan', 400)
        }

        await conn.beginTransaction()

        for (const r of list) {
            await conn.query(
                `UPDATE tkaryawan
        SET kar_gaji_pokok = ?,
            kar_gaji_per_hari = ROUND(? / ${HARI_BULAN})
        WHERE kar_nik = ?
          AND kar_status_aktif = 1
          AND kar_kd_unit IN (SELECT kd_unit FROM tunit WHERE nm_unit LIKE 'RotiQ%')`,
                [r.gapok, r.gapok, r.nik]
            )
        }

        await conn.commit()

        success(res, { updated: list.length }, `${list.length} data setting gaji roti berhasil disimpan`)

    } catch (err) {
        try { await conn.rollback() } catch { /* abaikan */ }
        next(err)
    } finally {
        conn.release()
    }
}
