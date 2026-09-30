import pool from '../config/database.js'
import { success, error, paginated } from '../helpers/response.js'
import { buildOrderBy, applyAllColumnFilters } from '../helpers/browse.js'

// Whitelist sort & filter kolom (alias frontend -> kolom SQL)
// Kolom tanggal dibungkus DATE_FORMAT agar konsisten 'YYYY-MM-DD'.
const DF = (col) => `DATE_FORMAT(${col}, '%Y-%m-%d')`
const BROWSE_COLUMNS = {
    Nomor: 'a.pkwt_nomor',
    Tanggal: DF('a.pkwt_tanggal'),
    NIK: 'b.kar_nik',
    Nama: 'b.kar_nama',
    Jabatan: 'c.nm_jabat',
    Departmen: 'd.nm_dept',
    Unit: 'e.nm_unit',
    StatusPKWT: 'a.pkwt_kar_status2',
    TglMulai: DF('a.pkwt_tgl_mulai2'),
    TglAkhir: DF('a.pkwt_tgl_akhir2'),
    TempatLahir: 'b.kar_tempatlahir',
    TglLahir: DF('b.kar_tgllahir'),
    Alamat: 'b.kar_alamat',
}
const DATE_ALIASES = new Set(['Tanggal', 'TglMulai', 'TglAkhir', 'TglLahir'])

export const getAllPkwt = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1
        const perPage = parseInt(req.query.per_page) || 25
        const search = req.query.search || ''
        const startDate = req.query.start_date
        const endDate = req.query.end_date
        const offset = (page - 1) * perPage

        let whereClause = ' WHERE 1=1'
        const params = []

        if (req.user.user.toLowerCase() !== 'pusat') {
            whereClause += ' AND e.kd_unit = ?'
            params.push(req.user.kd_unit)
        }

        if (search) {
            whereClause += ` AND (a.pkwt_nomor LIKE ? OR b.kar_nama LIKE ? OR b.kar_nik LIKE ?)`
            params.push(`%${search}%`, `%${search}%`, `%${search}%`)
        }

        if (startDate) {
            whereClause += ' AND a.pkwt_tanggal >= ?'
            params.push(startDate)
        }

        if (endDate) {
            whereClause += ' AND a.pkwt_tanggal <= ?'
            params.push(endDate)
        }

        const baseQuery = `
      SELECT a.pkwt_nomor AS Nomor, a.pkwt_tanggal AS Tanggal, 
         b.kar_nik AS NIK, b.kar_nama AS Nama, 
         c.nm_jabat AS Jabatan, d.nm_dept AS Departmen, e.nm_unit AS Unit,
         a.pkwt_kar_status2 AS StatusPKWT, 
         a.pkwt_tgl_mulai2 AS TglMulai, a.pkwt_tgl_akhir2 AS TglAkhir,
         b.kar_tempatlahir AS TempatLahir,
         b.kar_tgllahir AS TglLahir,
         b.kar_alamat AS Alamat, e.nm_unit2 AS unit2
      FROM tpkwt a
      LEFT JOIN tkaryawan b ON a.pkwt_kar_nik = b.kar_nik
      LEFT JOIN tjabatan c ON c.kd_jabat = b.kar_kd_jabat
      LEFT JOIN tdept d ON d.kd_dept = b.kar_kd_dept
      LEFT JOIN tunit e ON e.kd_unit = b.kar_kd_unit
    `

        // Filter per kolom (?filter_Nama=teks, ?filterSet_Nama=a&filterSet_Nama=b) + sorting (?sort_by=, ?sort_dir=)
        const scopedWhere = whereClause
        const scopedParams = [...params]
        const filtered = applyAllColumnFilters(whereClause, params, req.query, BROWSE_COLUMNS)
        whereClause = filtered.clause
        const filteredParams = filtered.params
        const orderBy = buildOrderBy(req.query, BROWSE_COLUMNS, 'ORDER BY a.pkwt_tanggal DESC')

        // ?distinct=Nama -> daftar nilai unik untuk popup filter header
        if (req.query.distinct && BROWSE_COLUMNS[req.query.distinct]) {
            const target = req.query.distinct
            const scoped = applyAllColumnFilters(scopedWhere, scopedParams, req.query, BROWSE_COLUMNS, target)
            const dsel = DATE_ALIASES.has(target)
                ? `DATE_FORMAT(sub.\`${target}\`, '%Y-%m-%d')`
                : `sub.\`${target}\``
            const [drows] = await pool.query(
                `SELECT DISTINCT ${dsel} AS value FROM (${baseQuery}${scoped.clause}) sub WHERE sub.\`${target}\` IS NOT NULL AND sub.\`${target}\` <> '' ORDER BY value LIMIT 500`,
                scoped.params
            )
            return success(res, drows.map((r) => r.value))
        }

        const [countResult] = await pool.query(`SELECT COUNT(*) as total FROM (${baseQuery}${whereClause}) as sub`, filteredParams)
        const total = countResult[0].total

        const [rows] = await pool.query(`${baseQuery}${whereClause} ${orderBy} LIMIT ? OFFSET ?`, [...filteredParams, perPage, offset])

        paginated(res, rows, { page, per_page: perPage, total, last_page: Math.ceil(total / perPage) })

    } catch (err) { next(err) }
}

export const getMaxKode = async (req, res, next) => {
    try {
        const now = new Date()
        const year = now.getFullYear()
        const monthRoman = getRomanMonth(now.getMonth() + 1) // 1-12 → I-XII
        const prefix = `KK.BSMGRUP-${monthRoman}-${year}`

        // 🔥 Cari nomor terakhir dengan prefix bulan & tahun yang sama
        const [rows] = await pool.query(
            `SELECT MAX(pkwt_nomor) AS maxNomor FROM tpkwt WHERE pkwt_nomor LIKE ?`,
            [`%-${prefix}`]
        )

        let nextNum = 1
        if (rows[0]?.maxNomor) {
            // Extract nomor dari format: "001-KK.BSMGRUP-VI-2025"
            const parts = rows[0].maxNomor.split('-')
            if (parts.length > 0) {
                nextNum = parseInt(parts[0]) + 1
            }
        }

        const kode = `${String(nextNum).padStart(3, '0')}-${prefix}`
        console.log('📋 Max Kode:', rows[0]?.maxNomor, '→ Next:', kode)
        success(res, { kode })

    } catch (err) { next(err) }
}

// 🔥 Helper: angka bulan ke romawi
function getRomanMonth(month) {
    const romans = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']
    return romans[month - 1] || ''
}

export const getPkwtById = async (req, res, next) => {
    try {
        const [rows] = await pool.query(
            `SELECT a.*, b.kar_nama, d.nm_dept, c.nm_jabat, 
            b.kar_pkwt, b.kar_tglawal_kontrak, b.kar_tglakhir_kontrak,
            b.kar_tempatlahir, b.kar_tgllahir, b.kar_alamat, e.nm_unit2 AS unit2
     FROM tpkwt a
       LEFT JOIN tkaryawan b ON a.pkwt_kar_nik = b.kar_nik
       LEFT JOIN tdept d ON d.kd_dept = b.kar_kd_dept
       LEFT JOIN tjabatan c ON c.kd_jabat = b.kar_kd_jabat
       LEFT JOIN tunit e ON e.kd_unit = b.kar_kd_unit
       WHERE a.pkwt_nomor = ?`,
            [req.params.id]
        )

        if (rows.length === 0) return error(res, 'Data tidak ditemukan', 404)
        success(res, rows[0])

    } catch (err) { next(err) }
}

export const getKaryawanDetail = async (req, res, next) => {
    try {
        const [rows] = await pool.query(
            `SELECT kar_nama, nm_dept, nm_jabat, kar_pkwt, kar_status_pkwt, kar_tglawal_kontrak, kar_tglakhir_kontrak
       FROM tkaryawan a
       LEFT JOIN tdept d ON a.kar_kd_dept = d.kd_dept
       LEFT JOIN tjabatan c ON a.kar_kd_jabat = c.kd_jabat
       WHERE a.kar_nik = ?`,
            [req.params.nik]
        )

        if (rows.length === 0) return error(res, 'Karyawan tidak ditemukan', 404)
        success(res, rows[0])

    } catch (err) { next(err) }
}

export const createPkwt = async (req, res, next) => {
    try {
        const data = req.body

        let karPkwt = data.pkwt_kar_status2
        if (data.pkwt_kar_status2 === 'PKWT' && data.pkwt_ke) {
            karPkwt = `PKWT ${data.pkwt_ke}`
        }

        await pool.query(
            `INSERT INTO tpkwt (pkwt_nomor, pkwt_kar_nik, pkwt_tanggal, pkwt_kar_status1, pkwt_tgl_mulai1, pkwt_tgl_akhir1, pkwt_kar_status2, pkwt_tgl_mulai2, pkwt_tgl_akhir2)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [data.pkwt_nomor, data.pkwt_kar_nik, data.pkwt_tanggal, data.pkwt_kar_status1, data.pkwt_tgl_mulai1, data.pkwt_tgl_akhir1, karPkwt, data.pkwt_tgl_mulai2, data.pkwt_tgl_akhir2]
        )

        await pool.query(
            // `UPDATE tkaryawan SET kar_status_pkwt = 'PERPANJANG', kar_pkwt = ? WHERE kar_nik = ?`,
            `UPDATE tkaryawan SET kar_tglawal_kontrak = ? , kar_tglakhir_kontrak = ? , kar_pkwt = ? WHERE kar_nik = ?`,
            [data.pkwt_tgl_mulai2, data.pkwt_tgl_akhir2, karPkwt, data.pkwt_kar_nik]
        )

        const [rows] = await pool.query(
            `SELECT a.*, b.kar_nama FROM tpkwt a LEFT JOIN tkaryawan b ON a.pkwt_kar_nik = b.kar_nik WHERE a.pkwt_nomor = ?`,
            [data.pkwt_nomor]
        )

        success(res, rows[0], 'Data berhasil disimpan', 201)

    } catch (err) { next(err) }
}

// 🔥 UPDATE - Update tkaryawan
export const updatePkwt = async (req, res, next) => {
    const conn = await pool.getConnection()
    try {
        const data = req.body

        let karPkwt = data.pkwt_kar_status2
        if (data.pkwt_kar_status2 === 'PKWT' && data.pkwt_ke) {
            karPkwt = `PKWT ${data.pkwt_ke}`
        }

        await conn.beginTransaction()

        await conn.query(
            `UPDATE tpkwt SET pkwt_kar_nik=?, pkwt_tanggal=?, pkwt_kar_status1=?, pkwt_tgl_mulai1=?, pkwt_tgl_akhir1=?, pkwt_kar_status2=?, pkwt_tgl_mulai2=?, pkwt_tgl_akhir2=? WHERE pkwt_nomor=?`,
            [data.pkwt_kar_nik, data.pkwt_tanggal, data.pkwt_kar_status1, data.pkwt_tgl_mulai1, data.pkwt_tgl_akhir1, karPkwt, data.pkwt_tgl_mulai2, data.pkwt_tgl_akhir2, req.params.id]
        )

        await conn.query(
            // `UPDATE tkaryawan SET kar_pkwt = ? WHERE kar_nik = ?`,
            `UPDATE tkaryawan SET kar_tglawal_kontrak = ? , kar_tglakhir_kontrak = ? , kar_pkwt = ? WHERE kar_nik = ?`,
            [data.pkwt_tgl_mulai2, data.pkwt_tgl_akhir2, karPkwt, data.pkwt_kar_nik]
        )

        await conn.commit()

        const [rows] = await pool.query(
            `SELECT a.*, b.kar_nama FROM tpkwt a LEFT JOIN tkaryawan b ON a.pkwt_kar_nik = b.kar_nik WHERE a.pkwt_nomor = ?`,
            [req.params.id]
        )

        success(res, rows[0], 'Data berhasil diupdate')

    } catch (err) {
        await conn.rollback()
        next(err)
    } finally { conn.release() }
}

export const deletePkwt = async (req, res, next) => {
    const conn = await pool.getConnection()
    try {
        // 🔥 Ambil NIK dulu sebelum dihapus
        const [rows] = await pool.query('SELECT pkwt_kar_nik FROM tpkwt WHERE pkwt_nomor = ?', [req.params.id])

        if (rows.length === 0) {
            return error(res, 'Data tidak ditemukan', 404)
        }

        const nik = rows[0].pkwt_kar_nik

        await conn.beginTransaction()

        // Hapus dari tpkwt
        await conn.query('DELETE FROM tpkwt WHERE pkwt_nomor = ?', [req.params.id])

        // 🔥 Update status jadi PENGAJUAN lagi
        await conn.query(
            'UPDATE tkaryawan SET kar_status_pkwt = ? WHERE kar_nik = ?',
            ['PENGAJUAN', nik]
        )

        await conn.commit()

        success(res, null, 'Data berhasil dihapus, status kembali ke PENGAJUAN')

    } catch (err) {
        await conn.rollback()
        next(err)
    } finally {
        conn.release()
    }
}

export const getRiwayatPkwt = async (req, res, next) => {
    try {
        const [rows] = await pool.query(
            `SELECT pkwt_nomor, pkwt_tanggal,
                pkwt_kar_status2 AS status, pkwt_tgl_mulai2 AS tgl_mulai, pkwt_tgl_akhir2 AS tgl_akhir
             FROM tpkwt WHERE pkwt_kar_nik = ? AND pkwt_kar_status2 IS NOT NULL
             ORDER BY tgl_akhir DESC`,
            [req.params.nik, req.params.nik]
        )
        success(res, rows)
    } catch (err) { next(err) }
}

export const lookupKaryawanAktif = async (req, res, next) => {
    try {
        let query = 'SELECT kar_nik AS NIK, kar_nama AS Nama FROM tkaryawan WHERE kar_status_aktif = 1'
        const params = []

        if (req.user.user.toLowerCase() !== 'pusat') {
            query += ' AND kar_kd_unit = ?'
            params.push(req.user.kd_unit)
        }

        query += ' ORDER BY kar_nama'

        const [rows] = await pool.query(query, params)
        success(res, rows)

    } catch (err) { next(err) }
}