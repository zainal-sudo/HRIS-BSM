import pool from '../config/database.js'
import { success, error } from '../helpers/response.js'
import { FILTER_UNIT_PKRT } from '../helpers/pkrt.js'

/**
 * SETTING GAJI PKRT
 * Master tunjangan & potongan gaji karyawan unit PKRT
 * (PT Entri Jaya Makmur PKRT, tunit.kd_unit = 20).
 *
 * Semua nilai disimpan di tkaryawan, jadi modul ini cuma menampilkan
 * dan memperbarui kolom angka milik unit PKRT:
 *   kar_gaji_pokok              -> GAPOK
 *   kar_tunjangan_jabatan       -> T JABATAN
 *   kar_tunjangan_kompetensi    -> T KOMPETENSI
 *   kar_tunjangan_makan         -> T MAKAN
 *   kar_pph21                   -> POT PPH21 bulanan
 *   kar_bpjs_kesehatan          -> Pot. BPJS Kesehatan
 *   kar_bpjs_ketenagakerjaan    -> Pot. BPJS Ketenagakerjaan
 *   kar_simpanan_koperasi       -> Simpanan Kop
 *   kar_cicilan                 -> cicilan
 *
 * Kolom tsb dipakai langsung oleh "Proses Gaji PKRT" (menu Transaksi).
 * Pola mengikuti settingGajiBsmController: filter unit -> grid -> simpan
 * massal dalam 1 transaksi.
 */

/** Kolom angka yang boleh diedit + pemetaan ke kolom fisik tkaryawan */
const EDITABLE_COLUMNS = {
    gapok: 'kar_gaji_pokok',
    tjabatan: 'kar_tunjangan_jabatan',
    tkompetensi: 'kar_tunjangan_kompetensi',
    tmakan: 'kar_tunjangan_makan',
    pph21: 'kar_pph21',
    bpjskesehatan: 'kar_bpjs_kesehatan',
    bpjstk: 'kar_bpjs_ketenagakerjaan',
    simpankoperasi: 'kar_simpanan_koperasi',
    cicilan: 'kar_cicilan',
}

const num = (v) => {
    const n = Number(v)
    return isNaN(n) ? 0 : n
}

/**
 * GET /api/setting-gaji-pkrt/unit
 * Daftar unit PKRT untuk dropdown filter.
 */
export const getUnitSettingGajiPkrt = async (req, res, next) => {
    try {
        const [rows] = await pool.query(
            `SELECT kd_unit AS kode, nm_unit AS nama
       FROM tunit
       WHERE nm_unit LIKE '%PKRT%'
       ORDER BY nm_unit`
        )
        success(res, rows)
    } catch (err) {
        next(err)
    }
}

/**
 * GET /api/setting-gaji-pkrt?unit=
 * Grid karyawan aktif unit PKRT + nilai setting-nya.
 * Kolom THP dikirim hanya sebagai informasi (dihitung ulang di server).
 */
export const getSettingGajiPkrt = async (req, res, next) => {
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
        COALESCE(k.kar_no_rekening, '') AS rekening,
        COALESCE(k.kar_gaji_pokok, 0) AS gapok,
        COALESCE(k.kar_tunjangan_jabatan, 0) AS tjabatan,
        COALESCE(k.kar_tunjangan_kompetensi, 0) AS tkompetensi,
        COALESCE(k.kar_tunjangan_makan, 0) AS tmakan,
        COALESCE(k.kar_pph21, 0) AS pph21,
        COALESCE(k.kar_bpjs_kesehatan, 0) AS bpjskesehatan,
        COALESCE(k.kar_bpjs_ketenagakerjaan, 0) AS bpjstk,
        COALESCE(k.kar_simpanan_koperasi, 0) AS simpankoperasi,
        COALESCE(k.kar_cicilan, 0) AS cicilan
      FROM tkaryawan k
      LEFT JOIN tjabatan j ON j.kd_jabat = k.kar_kd_jabat
      LEFT JOIN tunit u ON u.kd_unit = k.kar_kd_unit
      WHERE k.kar_status_aktif = 1
        AND ${FILTER_UNIT_PKRT}
        ${filterUnit}
      ORDER BY k.kar_nama`,
            params
        )

        // THP hanya membantu HRD mengecek hasil (gapok + 3 tunjangan)
        const data = rows.map((r) => ({
            ...r,
            thp: num(r.gapok) + num(r.tjabatan) + num(r.tkompetensi) + num(r.tmakan),
        }))

        success(res, data, `${data.length} karyawan PKRT dimuat`)

    } catch (err) {
        next(err)
    }
}

/**
 * PUT /api/setting-gaji-pkrt
 * Simpan setting gaji PKRT (UPDATE tkaryawan per NIK, 1 transaksi).
 * Body: { rows: [{ nik, gapok, tjabatan, tkompetensi, tmakan,
 *                  pph21, bpjskesehatan, bpjstk, simpankoperasi, cicilan }] }
 *
 * UPDATE dibatasi ke karyawan aktif unit PKRT supaya tidak bisa dipakai
 * menimpa Setting Gaji BSM / N3 / Roti yang memakai tabel & unit lain.
 */
export const saveSettingGajiPkrt = async (req, res, next) => {
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
                ...Object.fromEntries(
                    Object.keys(EDITABLE_COLUMNS).map((k) => [k, num(r[k])])
                ),
            }))

        if (list.length === 0) {
            return error(res, 'Tidak ada NIK valid untuk disimpan', 400)
        }

        await conn.beginTransaction()

        const setSql = Object.keys(EDITABLE_COLUMNS)
            .map((k) => `${EDITABLE_COLUMNS[k]} = ?`)
            .join(', ')

        for (const r of list) {
            await conn.query(
                `UPDATE tkaryawan
        SET ${setSql}
        WHERE kar_nik = ?
          AND kar_status_aktif = 1
          AND kar_kd_unit IN (SELECT kd_unit FROM tunit WHERE ${FILTER_UNIT_PKRT})`,
                [...Object.keys(EDITABLE_COLUMNS).map((k) => r[k]), r.nik]
            )
        }

        await conn.commit()

        success(res, { updated: list.length },
            `${list.length} data setting gaji PKRT berhasil disimpan`)

    } catch (err) {
        try { await conn.rollback() } catch { /* abaikan */ }
        next(err)
    } finally {
        conn.release()
    }
}

export { EDITABLE_COLUMNS }
