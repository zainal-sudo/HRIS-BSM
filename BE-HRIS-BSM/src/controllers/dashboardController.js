import pool from '../config/database.js'
import { success } from '../helpers/response.js'

/**
 * Helper: membangun WHERE clause untuk filter unit dashboard.
 * Menerima query param: ?kd_unit=xx (cabang) atau ?nm_unit2=xx (perusahaan).
 * Default: user-based filter.
 */
const buildUnitFilter = (req, tableAlias = '') => {
    const prefix = tableAlias ? `${tableAlias}.` : ''
    const kdUnit = req.query.kd_unit
    const nmUnit2 = req.query.nm_unit2

    if (kdUnit) {
        return { sql: `${prefix}kar_kd_unit = ?`, params: [kdUnit] }
    }
    if (nmUnit2) {
        return {
            sql: `${prefix}kar_kd_unit IN (SELECT kd_unit FROM tunit WHERE nm_unit2 = ?)`,
            params: [nmUnit2]
        }
    }
    // Default: user-based
    if (req.user.user.toLowerCase() !== 'pusat') {
        return { sql: `${prefix}kar_kd_unit LIKE ?`, params: [req.user.kd_unit] }
    }
    return { sql: '1=1', params: [] }
}

/**
 * Helper: sama seperti di atas tapi untuk tabel tunit (unit filter langsung).
 */
const buildUnitFilterDirect = (req) => {
    const kdUnit = req.query.kd_unit
    const nmUnit2 = req.query.nm_unit2

    if (kdUnit) {
        return { sql: 'kd_unit = ?', params: [kdUnit] }
    }
    if (nmUnit2) {
        return { sql: 'nm_unit2 = ?', params: [nmUnit2] }
    }
    if (req.user.user.toLowerCase() !== 'pusat') {
        return { sql: 'kd_unit LIKE ?', params: [req.user.kd_unit] }
    }
    return { sql: '1=1', params: [] }
}

/**
 * GET /api/dashboard/summary
 * Ringkasan kartu statistik (Total Karyawan, Unit, Dept, Kontrak Habis)
 */
export const getSummary = async (req, res, next) => {
    try {
        const kf = buildUnitFilter(req)
        const uf = buildUnitFilterDirect(req)

        // Total Karyawan Aktif
        const [karyawan] = await pool.query(
            `SELECT COUNT(*) AS total FROM tkaryawan WHERE kar_status_aktif = 1 AND ${kf.sql}`,
            kf.params
        )

        // Total Unit
        const [unit] = await pool.query(
            `SELECT COUNT(*) AS total FROM tunit WHERE ${uf.sql}`,
            uf.params
        )

        // Total Departemen
        const [dept] = await pool.query(`SELECT COUNT(*) AS total FROM tdept`)

        // Kontrak yang akan berakhir dalam 30 hari
        const [kontrakHabis] = await pool.query(
            `SELECT COUNT(*) AS total FROM tkaryawan 
       WHERE kar_tglakhir_kontrak IS NOT NULL 
        AND kar_tglakhir_kontrak <= DATE_ADD(CURDATE(), INTERVAL 60 DAY)
         AND kar_status_aktif = 1 and kar_status_karyawan like '%kontrak%'
         AND ${kf.sql}`,
            kf.params
        )

        success(res, {
            total_karyawan: karyawan[0]?.total || 0,
            total_unit: unit[0]?.total || 0,
            total_departemen: dept[0]?.total || 0,
            kontrak_habis: kontrakHabis[0]?.total || 0
        })

    } catch (err) {
        next(err)
    }
}

/**
 * GET /api/dashboard/karyawan-per-bulan
 * Grafik karyawan masuk per bulan (12 bulan terakhir)
 */
export const getKaryawanPerBulan = async (req, res, next) => {
    try {
        const kf = buildUnitFilter(req)

        // Karyawan masuk per bulan
        const [masukRows] = await pool.query(
            `SELECT 
         MONTH(kar_tgl_masuk) AS bulan,
         YEAR(kar_tgl_masuk) AS tahun,
         COUNT(*) AS jumlah
       FROM tkaryawan
       WHERE kar_tgl_masuk IS NOT NULL
         AND ${kf.sql}
         AND kar_tgl_masuk >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
       GROUP BY YEAR(kar_tgl_masuk), MONTH(kar_tgl_masuk)
       ORDER BY tahun, bulan`,
            kf.params
        )

        // Karyawan keluar per bulan
        const [keluarRows] = await pool.query(
            `SELECT 
         MONTH(kar_tgl_keluar) AS bulan,
         YEAR(kar_tgl_keluar) AS tahun,
         COUNT(*) AS jumlah
       FROM tkaryawan
       WHERE kar_tgl_keluar IS NOT NULL
         AND ${kf.sql}
         AND kar_tgl_keluar >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
       GROUP BY YEAR(kar_tgl_keluar), MONTH(kar_tgl_keluar)
       ORDER BY tahun, bulan`,
            kf.params
        )

        // Format untuk chart (12 bulan terakhir)
        const labels = []
        const data_masuk = []
        const data_keluar = []
        const now = new Date()

        for (let i = 11; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
            const bulan = d.getMonth() + 1
            const tahun = d.getFullYear()
            const foundMasuk = masukRows.find(r => r.bulan === bulan && r.tahun === tahun)
            const foundKeluar = keluarRows.find(r => r.bulan === bulan && r.tahun === tahun)
            labels.push(d.toLocaleDateString('id-ID', { month: 'short', year: 'numeric' }))
            data_masuk.push(foundMasuk?.jumlah || 0)
            data_keluar.push(foundKeluar?.jumlah || 0)
        }

        success(res, { labels, data_masuk, data_keluar })

    } catch (err) {
        next(err)
    }
}

/**
 * GET /api/dashboard/kontrak-berakhir-per-bulan
 * Grafik kontrak berakhir per bulan (6 bulan ke depan)
 */
export const getKontrakBerakhirPerBulan = async (req, res, next) => {
    try {
        const kf = buildUnitFilter(req)

        const [rows] = await pool.query(
            `SELECT 
         MONTH(kar_tglakhir_kontrak) AS bulan,
         YEAR(kar_tglakhir_kontrak) AS tahun,
         COUNT(*) AS jumlah
       FROM tkaryawan
       WHERE kar_tglakhir_kontrak IS NOT NULL
         AND kar_tglakhir_kontrak >= CURDATE()
         AND kar_tglakhir_kontrak <= DATE_ADD(CURDATE(), INTERVAL 6 MONTH)
         AND kar_status_aktif = 1 and kar_status_karyawan like '%kontrak%'
         AND ${kf.sql}
       GROUP BY YEAR(kar_tglakhir_kontrak), MONTH(kar_tglakhir_kontrak)
       ORDER BY tahun, bulan`,
            kf.params
        )

        const labels = []
        const data = []
        const now = new Date()

        for (let i = 0; i < 6; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
            const bulan = d.getMonth() + 1
            const tahun = d.getFullYear()
            const found = rows.find(r => r.bulan === bulan && r.tahun === tahun)
            labels.push(d.toLocaleDateString('id-ID', { month: 'short', year: 'numeric' }))
            data.push(found?.jumlah || 0)
        }

        success(res, { labels, data })

    } catch (err) {
        next(err)
    }
}

/**
 * GET /api/dashboard/izin-hari-ini
 * Jumlah karyawan izin hari ini
 */
export const getIzinHariIni = async (req, res, next) => {
    try {
        const kf = buildUnitFilter(req, 'b')

        const [rows] = await pool.query(
            `SELECT COUNT(*) AS total
       FROM tijin a
       LEFT JOIN tkaryawan b ON a.kar_nik = b.kar_nik
       WHERE DATE(a.tanggal) = CURDATE()
         AND ${kf.sql}`,
            kf.params
        )

        success(res, { total: rows[0]?.total || 0 })

    } catch (err) {
        next(err)
    }
}

/**
 * GET /api/dashboard/lembur-hari-ini
 * Jumlah karyawan lembur hari ini
 */
export const getLemburHariIni = async (req, res, next) => {
    try {
        const kf = buildUnitFilter(req, 'b')

        const [rows] = await pool.query(
            `SELECT COUNT(*) AS total
       FROM tlembur a
       LEFT JOIN tkaryawan b ON a.lem_kar_nik = b.kar_nik
       WHERE DATE(a.lem_tanggal) = CURDATE()
         AND ${kf.sql}`,
            kf.params
        )

        success(res, { total: rows[0]?.total || 0 })

    } catch (err) {
        next(err)
    }
}

/**
 * GET /api/dashboard/aktivitas-terbaru
 * Aktivitas terbaru (10 data terakhir: karyawan baru, izin, lembur, kontrak)
 */
/**
 * GET /api/dashboard/organisasi
 * Hierarki organisasi: Total → Per Perusahaan → Per Cabang → Per Departemen
 */
export const getOrganisasi = async (req, res, next) => {
    try {
        const kf = buildUnitFilter(req, 'k')
        const kfTotal = buildUnitFilter(req)
        const nmUnit2 = req.query.nm_unit2
        const kdUnit = req.query.kd_unit

        // Total keseluruhan karyawan aktif
        const [totalRows] = await pool.query(
            `SELECT COUNT(*) AS total FROM tkaryawan WHERE kar_status_aktif = 1 AND ${kfTotal.sql}`,
            kfTotal.params
        )
        const totalKeseluruhan = totalRows[0]?.total || 0

        // Per Perusahaan (nm_unit2) + per Cabang (nm_unit) + per Departemen
        const filterOrg = []
        const filterOrgParams = []
        filterOrg.push('k.kar_status_aktif = 1')

        if (kdUnit) {
            filterOrg.push('k.kar_kd_unit = ?')
            filterOrgParams.push(kdUnit)
        } else if (nmUnit2) {
            filterOrg.push('u.nm_unit2 = ?')
            filterOrgParams.push(nmUnit2)
        } else if (req.user.user.toLowerCase() !== 'pusat') {
            filterOrg.push('k.kar_kd_unit LIKE ?')
            filterOrgParams.push(req.user.kd_unit)
        }

        const [rows] = await pool.query(
            `SELECT 
         u.kd_unit,
         u.nm_unit2 AS perusahaan,
         u.nm_unit AS cabang,
         COALESCE(d.nm_dept, '-') AS departemen,
         COUNT(*) AS total
       FROM tkaryawan k
       INNER JOIN tunit u ON u.kd_unit = k.kar_kd_unit
       LEFT JOIN tdept d ON d.kd_dept = k.kar_kd_dept
       WHERE ${filterOrg.join(' AND ')}
       GROUP BY u.kd_unit, u.nm_unit2, u.nm_unit, k.kar_kd_dept, d.nm_dept
       ORDER BY u.nm_unit2, u.nm_unit, d.nm_dept`,
            filterOrgParams
        )

        // Nested structure
        const perusahaanMap = new Map()

        for (const r of rows) {
            if (!perusahaanMap.has(r.perusahaan)) {
                perusahaanMap.set(r.perusahaan, {
                    nama: r.perusahaan,
                    total: 0,
                    cabang: new Map()
                })
            }
            const p = perusahaanMap.get(r.perusahaan)

            if (!p.cabang.has(r.cabang)) {
                p.cabang.set(r.cabang, {
                    kd_unit: r.kd_unit,
                    nama: r.cabang,
                    total: 0,
                    departemen: []
                })
            }
            const c = p.cabang.get(r.cabang)

            if (!c.kd_unit) c.kd_unit = r.kd_unit

            c.departemen.push({
                nama: r.departemen,
                total: r.total
            })
            c.total += r.total
            p.total += r.total
        }

        // Convert Maps to arrays
        const perusahaan = []
        for (const [_, p] of perusahaanMap) {
            perusahaan.push({
                nama: p.nama,
                total: p.total,
                cabang: Array.from(p.cabang.values())
            })
        }

        success(res, {
            total_keseluruhan: totalKeseluruhan,
            perusahaan
        })

    } catch (err) {
        next(err)
    }
}

export const getAktivitasTerbaru = async (req, res, next) => {
    try {
        const kf = buildUnitFilter(req)
        const kfb = buildUnitFilter(req, 'b')

        const [rows] = await pool.query(
            `SELECT 
         'Karyawan Baru' AS tipe,
         kar_nik AS nik,
         kar_nama AS nama,
         kar_tgl_masuk AS tanggal,
         'Bergabung' AS aksi
       FROM tkaryawan
       WHERE kar_status_aktif = 1
         AND ${kf.sql}
         AND kar_tgl_masuk >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
       
       UNION ALL
       
       SELECT 
         'Izin' AS tipe,
         a.kar_nik AS nik,
         b.kar_nama AS nama,
         a.tanggal AS tanggal,
         CONCAT('Mengajukan izin: ', a.alasan) AS aksi
       FROM tijin a
       LEFT JOIN tkaryawan b ON a.kar_nik = b.kar_nik
       WHERE ${kfb.sql}
         AND a.tanggal >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
         AND a.tanggal <= CURDATE()
       
       UNION ALL
       
       SELECT 
         'Lembur' AS tipe,
         a.lem_kar_nik AS nik,
         b.kar_nama AS nama,
         a.lem_tanggal AS tanggal,
         CONCAT('Mengajukan lembur ', a.lem_durasi) AS aksi
       FROM tlembur a
       LEFT JOIN tkaryawan b ON a.lem_kar_nik = b.kar_nik
       WHERE ${kfb.sql}
         AND a.lem_tanggal >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
         AND a.lem_tanggal <= CURDATE()
       
       ORDER BY tanggal DESC
       LIMIT 10`,
            [...kf.params, ...kfb.params, ...kfb.params]
        )

        success(res, rows)

    } catch (err) {
        next(err)
    }
}