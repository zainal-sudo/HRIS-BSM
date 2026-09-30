import poolEntri from '../config/databaseEntri.js'
import { success, error } from '../helpers/response.js'

/**
 * SETTING GAJI N3 (PT Entri Jaya Makmur, unit 6)
 * Duplikasi form Delphi ufrmSettingGaji dari D:\program\hrd N3 dengan
 * database di server 192.168.194.33 / hrd_entri.
 *
 * Sama seperti Setting Gaji BSM, ditambah 2 kolom:
 *  - Tunj. Makan (kar_T_MAKAN)
 *  - Tunj. Transport (kar_T_HADIR)
 *
 * Modul ini dikunci untuk kode unit 6 (tanpa dropdown pabrik).
 */

/** Ubah apa pun jadi angka, nilai kosong/rusak -> 0 */
const num = (v) => {
    const n = Number(v)
    return isNaN(n) ? 0 : n
}

/**
 * GET /api/setting-gaji-n3
 * Grid karyawan unit 6 (setara loaddataall Delphi N3, pabrik terkunci 6).
 */
export const getSettingGajiN3 = async (req, res, next) => {
    try {
        const [rows] = await poolEntri.queryWithRetry(
            `SELECT
        k.kar_Nik AS nik,
        k.kar_nama AS nama,
        COALESCE(j.jab_nama, '') AS jabatan,
        COALESCE(k.kar_GAPOK, 0) AS gapok,
        COALESCE(k.kar_T_MAKAN, 0) AS tmakan,
        COALESCE(k.kar_T_HADIR, 0) AS transport,
        COALESCE(k.kar_T_KOMPETENSI, 0) AS tkompetensi,
        COALESCE(k.kar_T_JABATAN, 0) AS tjabatan,
        COALESCE(k.kar_T_LAIN, 0) AS tlain,
        COALESCE(k.kar_T_bpjstk, 0) AS tbpjstk,
        COALESCE(k.kar_T_BPJS, 0) AS tbpjs,
        COALESCE(k.kar_t_koperasi, 0) AS tkoperasi,
        COALESCE(k.kar_T_PPH21, 0) AS pph21
      FROM tkaryawan k
      LEFT JOIN tjabatan j ON j.jab_kode = k.kar_jab_kode
      WHERE k.kar_pab_kode = '6'
        AND k.kar_status_aktif = 1
        AND k.kar_sistem_gaji IN ('Harian', 'Bulanan')
      ORDER BY k.kar_nama`
        )

        success(res, rows, `${rows.length} karyawan dimuat`)

    } catch (err) {
        next(err)
    }
}

/**
 * PUT /api/setting-gaji-n3
 * Simpan massal (setara simpandata Delphi N3: UPDATE tkaryawan per NIK,
 * 1 transaksi).
 * Body: { rows: [{ nik, gapok, tmakan, transport, tkompetensi, tjabatan, tlain, tbpjstk, tbpjs, tkoperasi, pph21 }] }
 */
export const saveSettingGajiN3 = async (req, res, next) => {
    const conn = await poolEntri.getConnectionWithRetry()

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
                tmakan: num(r.tmakan),
                transport: num(r.transport),
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
          kar_T_MAKAN = ?,
          kar_T_HADIR = ?,
          kar_T_KOMPETENSI = ?,
          kar_T_JABATAN = ?,
          kar_T_LAIN = ?,
          kar_T_bpjstk = ?,
          kar_T_BPJS = ?,
          kar_t_koperasi = ?,
          kar_T_PPH21 = ?
        WHERE kar_Nik = ? AND kar_pab_kode = '6'`,
                [r.gapok, r.tmakan, r.transport, r.tkompetensi, r.tjabatan, r.tlain,
                 r.tbpjstk, r.tbpjs, r.tkoperasi, r.pph21, r.nik]
            )
        }

        await conn.commit()

        success(res, { updated: list.length }, `${list.length} data setting gaji N3 berhasil disimpan`)

    } catch (err) {
        try { await conn.rollback() } catch { /* abaikan */ }
        next(err)
    } finally {
        conn.release()
    }
}
