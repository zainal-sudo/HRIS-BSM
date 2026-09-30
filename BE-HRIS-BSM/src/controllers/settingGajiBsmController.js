import poolBsm from '../config/databaseBsm.js'
import { success, error } from '../helpers/response.js'

/**
 * SETTING GAJI BSM
 * Duplikasi form Delphi ufrmSettingGaji (D:\program\hrd bsm) dengan
 * database di server kedua (192.168.194.33 / hrd).
 *
 * Form aslinya:
 *  - Pilih Pabrik (tpabrik) -> Refresh (loaddataall): tampilkan karyawan
 *    aktif dengan sistem gaji Harian/Bulanan + join tjabatan.
 *    Kolom NIK/Nama/Jabatan read-only, kolom angka bisa diedit:
 *    Gapok, Tunj. Kompetensi, Tunj. Jabatan, Tunj. Absensi (kar_t_lain),
 *    BPJS TK, BPJS, Koperasi, PPh21.
 *  - Simpan / Simpan & Tutup (simpandata): UPDATE tkaryawan per NIK.
 *  - Export: export grid ke Excel (= CSV di web).
 */

/** Ubah apa pun jadi angka, nilai kosong/rusak -> 0 */
const num = (v) => {
    const n = Number(v)
    return isNaN(n) ? 0 : n
}

// Kolom angka yang boleh diupdate + pemetaan ke kolom fisik tkaryawan
const EDITABLE_COLUMNS = {
    gapok: 'kar_GAPOK',
    tkompetensi: 'kar_T_KOMPETENSI',
    tjabatan: 'kar_T_JABATAN',
    tlain: 'kar_T_LAIN',
    tbpjstk: 'kar_T_bpjstk',
    tbpjs: 'kar_T_BPJS',
    tkoperasi: 'kar_t_koperasi',
    pph21: 'kar_T_PPH21',
}

/**
 * GET /api/setting-gaji-bsm/pabrik
 * Daftar pabrik untuk dropdown (setara CDSPabrik di Delphi).
 */
export const getPabrikSettingGaji = async (req, res, next) => {
    try {
        const [rows] = await poolBsm.queryWithRetry(
            'SELECT pab_kode AS kode, pab_nama AS nama FROM tpabrik ORDER BY pab_nama'
        )
        success(res, rows)
    } catch (err) {
        next(err)
    }
}

/**
 * GET /api/setting-gaji-bsm?pabrik=
 * Grid karyawan per pabrik (setara loaddataall di Delphi).
 */
export const getSettingGaji = async (req, res, next) => {
    try {
        const pabrik = String(req.query.pabrik ?? '').trim()
        if (!pabrik) {
            return error(res, 'Parameter pabrik wajib diisi', 400)
        }

        const [rows] = await poolBsm.queryWithRetry(
            `SELECT
        k.kar_Nik AS nik,
        k.kar_nama AS nama,
        COALESCE(j.jab_nama, '') AS jabatan,
        COALESCE(k.kar_GAPOK, 0) AS gapok,
        COALESCE(k.kar_T_KOMPETENSI, 0) AS tkompetensi,
        COALESCE(k.kar_T_JABATAN, 0) AS tjabatan,
        COALESCE(k.kar_T_LAIN, 0) AS tlain,
        COALESCE(k.kar_T_bpjstk, 0) AS tbpjstk,
        COALESCE(k.kar_T_BPJS, 0) AS tbpjs,
        COALESCE(k.kar_t_koperasi, 0) AS tkoperasi,
        COALESCE(k.kar_T_PPH21, 0) AS pph21
      FROM tkaryawan k
      LEFT JOIN tjabatan j ON j.jab_kode = k.kar_jab_kode
      WHERE k.kar_pab_kode = ?
        AND k.kar_status_aktif = 1
        AND k.kar_sistem_gaji IN ('Harian', 'Bulanan')
      ORDER BY k.kar_nama`,
            [pabrik]
        )

        success(res, rows, `${rows.length} karyawan dimuat`)

    } catch (err) {
        next(err)
    }
}

/**
 * PUT /api/setting-gaji-bsm
 * Simpan massal (setara simpandata di Delphi: UPDATE tkaryawan per NIK,
 * 1 transaksi).
 * Body: { rows: [{ nik, gapok, tkompetensi, tjabatan, tlain, tbpjstk, tbpjs, tkoperasi, pph21 }] }
 */
export const saveSettingGaji = async (req, res, next) => {
    const conn = await poolBsm.getConnectionWithRetry()

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
                tkompetensi: num(r.tkompetensi),
                tjabatan: num(r.tjabatan),
                tlain: num(r.tlain),
                tbpjstk: num(r.tbpjstk),
                tbpjs: num(r.tbpjs),
                tkoperasi: num(r.tkoperasi),
                pph21: num(r.pph21),
            }))

        if (list.length === 0) {
            return error(res, 'Tidak ada NIK valid untuk disimpan', 400)
        }

        await conn.beginTransaction()

        for (const r of list) {
            await conn.query(
                `UPDATE tkaryawan SET
          kar_GAPOK = ?,
          kar_T_KOMPETENSI = ?,
          kar_T_JABATAN = ?,
          kar_T_LAIN = ?,
          kar_T_bpjstk = ?,
          kar_T_BPJS = ?,
          kar_t_koperasi = ?,
          kar_T_PPH21 = ?
        WHERE kar_Nik = ?`,
                [r.gapok, r.tkompetensi, r.tjabatan, r.tlain, r.tbpjstk, r.tbpjs, r.tkoperasi, r.pph21, r.nik]
            )
        }

        await conn.commit()

        success(res, { updated: list.length }, `${list.length} data setting gaji berhasil disimpan`)

    } catch (err) {
        try { await conn.rollback() } catch { /* abaikan */ }
        next(err)
    } finally {
        conn.release()
    }
}

export { EDITABLE_COLUMNS }
