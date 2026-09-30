import pool from '../config/database.js'
import { success, error, paginated } from '../helpers/response.js'
import { buildOrderBy, applyAllColumnFilters } from '../helpers/browse.js'
import fetch from 'node-fetch'
import FormData from 'form-data'

/**
 * GET /api/lembur
 * Browse lembur dengan filter tanggal dan unit
 */

// Whitelist sort & filter kolom (alias frontend -> kolom SQL)
// Jam_out adalah agregasi sehingga tidak ikut sort/filter.
// Kolom tanggal dibungkus DATE_FORMAT agar konsisten 'YYYY-MM-DD'.
const DF = (col) => `DATE_FORMAT(${col}, '%Y-%m-%d')`
const BROWSE_COLUMNS = {
    Nomor: 'a.lem_nomor',
    NIK: 'a.lem_kar_nik',
    Nama: 'b.kar_nama',
    Jabatan: 'c.nm_jabat',
    Departmen: 'd.nm_dept',
    Unit: 'e.nm_unit',
    Tanggal: DF('a.lem_tanggal'),
    JamMulai: 'a.lem_jammulai',
    JamAkhir: 'a.lem_jamakhir',
    Keterangan: 'a.lem_keterangan',
    Poin: 'a.lem_poin',
    Durasi: 'a.lem_durasi',
}
const DATE_ALIASES = new Set(['Tanggal'])
export const getAllLembur = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1
        const perPage = parseInt(req.query.per_page) || 25
        const search = req.query.search || ''
        const startDate = req.query.start_date || null
        const endDate = req.query.end_date || null
        const offset = (page - 1) * perPage

        let whereClause = ''
        const params = []

        // Filter unit
        if (req.user.user.toLowerCase() !== 'pusat') {
            whereClause = ' WHERE e.kd_unit = ?'
            params.push(req.user.kd_unit)
        } else {
            whereClause = ' WHERE 1=1'
        }

        // Filter tanggal
        if (startDate && endDate) {
            whereClause += ` AND a.lem_tanggal BETWEEN ? AND ?`
            params.push(startDate, endDate)
        }

        // Search
        if (search) {
            whereClause += ` AND (a.lem_nomor LIKE ? OR b.kar_nik LIKE ? OR b.kar_nama LIKE ?)`
            params.push(`%${search}%`, `%${search}%`, `%${search}%`)
        }

        const baseQuery = `
      SELECT 
        a.lem_nomor AS Nomor,
        a.lem_kar_nik AS NIK,
        b.kar_nama AS Nama,
        c.nm_jabat AS Jabatan,
        d.nm_dept AS Departmen,
        e.nm_unit AS Unit,
        a.lem_tanggal AS Tanggal,
        a.lem_jammulai AS JamMulai,
        a.lem_jamakhir AS JamAkhir,
        a.lem_keterangan AS Keterangan,
        MAX(CASE WHEN f.status_absen IN (1,2) THEN TIME(f.tanggal) END) AS Jam_out,
        a.lem_poin AS Poin,
        a.lem_durasi AS Durasi,
        a.lem_foto AS foto
      FROM tlembur a
      LEFT JOIN tkaryawan b ON a.lem_kar_nik = b.kar_nik
      LEFT JOIN tjabatan c ON c.kd_jabat = b.kar_kd_jabat
      LEFT JOIN tdept d ON d.kd_dept = b.kar_kd_dept
      LEFT JOIN tunit e ON e.kd_unit = b.kar_kd_unit
      LEFT JOIN tabsensitampung f ON (f.kar_nik = a.lem_kar_nik AND DATE(f.tanggal) = a.lem_tanggal)
    `

        // Filter per kolom (?filter_Nama=teks, ?filterSet_Nama=a&filterSet_Nama=b) + sorting (?sort_by=, ?sort_dir=)
        const scopedWhere = whereClause
        const scopedParams = [...params]
        const filtered = applyAllColumnFilters(whereClause, params, req.query, BROWSE_COLUMNS)
        whereClause = filtered.clause
        const filteredParams = filtered.params
        const orderBy = buildOrderBy(req.query, BROWSE_COLUMNS, 'ORDER BY a.lem_tanggal DESC')

        // ?distinct=Nama -> daftar nilai unik untuk popup filter header
        // Catatan: TIDAK memakai baseQuery karena agregasi MAX(Jam_out) tanpa
        // GROUP BY akan menciutkan subquery menjadi 1 baris. Pakai query
        // ringan tanpa join f dan tanpa agregasi (kolom Jam_out memang
        // dikecualikan dari sort/filter).
        if (req.query.distinct && BROWSE_COLUMNS[req.query.distinct]) {
            const target = req.query.distinct
            const dcol = BROWSE_COLUMNS[target]
            const scoped = applyAllColumnFilters(scopedWhere, scopedParams, req.query, BROWSE_COLUMNS, target)
            const dsel = DATE_ALIASES.has(target)
                ? `DATE_FORMAT(${dcol}, '%Y-%m-%d')`
                : dcol
            const [drows] = await pool.query(
                `SELECT DISTINCT ${dsel} AS value
         FROM tlembur a
         LEFT JOIN tkaryawan b ON a.lem_kar_nik = b.kar_nik
         LEFT JOIN tjabatan c ON c.kd_jabat = b.kar_kd_jabat
         LEFT JOIN tdept d ON d.kd_dept = b.kar_kd_dept
         LEFT JOIN tunit e ON e.kd_unit = b.kar_kd_unit
         ${scoped.clause} AND ${dcol} IS NOT NULL AND ${dcol} <> '' ORDER BY value LIMIT 500`,
                scoped.params
            )
            return success(res, drows.map((r) => r.value))
        }

        // Count
        const [countResult] = await pool.query(
            `SELECT COUNT(*) as total FROM (${baseQuery}${whereClause}) as sub`,
            filteredParams
        )
        const total = countResult[0].total

        // Data
        const [rows] = await pool.query(
            `${baseQuery}${whereClause} GROUP BY a.lem_nomor, a.lem_kar_nik, b.kar_nama, c.nm_jabat, d.nm_dept, e.nm_unit, a.lem_tanggal, a.lem_jammulai, a.lem_jamakhir, a.lem_keterangan ${orderBy} LIMIT ? OFFSET ?`,
            [...filteredParams, perPage, offset]
        )

        paginated(res, rows, {
            page,
            per_page: perPage,
            total,
            last_page: Math.ceil(total / perPage)
        })

    } catch (err) {
        next(err)
    }
}

/**
 * GET /api/lembur/max-kode
 * Generate nomor lembur otomatis: LEM.yymm.xxxx
 */
export const getMaxKode = async (req, res, next) => {
    try {
        const tanggal = req.query.tanggal || new Date().toISOString().split('T')[0]
        const d = new Date(tanggal)
        const yymm = d.getFullYear().toString().slice(2) + String(d.getMonth() + 1).padStart(2, '0')
        const prefix = `LEM.${yymm}.`

        const [rows] = await pool.query(
            'SELECT MAX(lem_nomor) AS maxNomor FROM tlembur WHERE lem_nomor LIKE ?',
            [`${prefix}%`]
        )

        let nextNum = 1
        if (rows[0]?.maxNomor) {
            const parts = rows[0].maxNomor.split('.')
            nextNum = parseInt(parts[2]) + 1
        }

        const kode = `${prefix}${String(nextNum).padStart(4, '0')}`
        success(res, { kode })

    } catch (err) {
        next(err)
    }
}

/**
 * GET /api/lembur/:id
 * Get single lembur by lem_nomor
 */
export const getLemburById = async (req, res, next) => {
    try {
        const [rows] = await pool.query(
            'SELECT * FROM tlembur WHERE lem_nomor = ?',
            [req.params.id]
        )

        if (rows.length === 0) {
            return error(res, 'Data lembur tidak ditemukan', 404)
        }

        success(res, rows[0])

    } catch (err) {
        next(err)
    }
}

/**
 * GET /api/lembur/karyawan/:nik
 * Detail karyawan + absensi
 */
export const getDetailKaryawan = async (req, res, next) => {
    try {
        const nik = req.params.nik
        const tanggal = req.query.tanggal || new Date().toISOString().split('T')[0]

        // Detail karyawan
        const query = `
      SELECT a.kar_nama, b.nm_dept, c.nm_jabat
      FROM tkaryawan a
      LEFT JOIN tdept b ON a.kar_kd_dept = b.kd_dept
      LEFT JOIN tjabatan c ON a.kar_kd_jabat = c.kd_jabat
      WHERE a.kar_nik = ?
    `
        const [rows] = await pool.query(query, [nik])

        if (rows.length === 0) {
            return error(res, 'Karyawan tidak ditemukan', 404)
        }

        // Ambil absensi untuk tanggal tersebut
        const absenQuery = `
      SELECT 
        MIN(CASE WHEN status_absen = 1 THEN TIME(tanggal) END) AS Jam_in,
        MAX(CASE WHEN status_absen IN (1,2) THEN TIME(tanggal) END) AS Jam_out
      FROM tabsensitampung
      WHERE kar_nik = ? AND DATE(tanggal) = ?
    `
        const [absenRows] = await pool.query(absenQuery, [nik, tanggal])

        success(res, {
            ...rows[0],
            absensi: absenRows[0] || { Jam_in: null, Jam_out: null }
        })

    } catch (err) {
        next(err)
    }
}

/**
 * POST /api/lembur
 * Create new lembur
 */
export const createLembur = async (req, res, next) => {
    try {
        const { lem_nomor, lem_kar_nik, lem_tanggal, lem_jammulai, lem_jamakhir, lem_keterangan, lem_foto, lem_poin, lem_durasi } = req.body

        if (!lem_kar_nik || !lem_tanggal || !lem_jammulai || !lem_jamakhir) {
            return error(res, 'NIK, tanggal, jam mulai, dan jam akhir wajib diisi', 400)
        }

        const [result] = await pool.query(
            'INSERT INTO tlembur (lem_nomor, lem_kar_nik, lem_tanggal, lem_jammulai, lem_jamakhir, lem_keterangan, lem_foto, lem_poin, lem_durasi) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [lem_nomor, lem_kar_nik, lem_tanggal, lem_jammulai, lem_jamakhir, lem_keterangan, lem_foto || null, lem_poin, lem_durasi]
        )

        const [rows] = await pool.query('SELECT * FROM tlembur WHERE lem_nomor = ?', [lem_nomor])
        success(res, rows[0], 'Data lembur berhasil disimpan', 201)

    } catch (err) {
        next(err)
    }
}

/**
 * PUT /api/lembur/:id
 * Update lembur
 */
export const updateLembur = async (req, res, next) => {
    try {
        const { lem_kar_nik, lem_tanggal, lem_jammulai, lem_jamakhir, lem_keterangan, lem_foto, lem_poin, lem_durasi } = req.body

        await pool.query(
            'UPDATE tlembur SET lem_kar_nik=?, lem_tanggal=?, lem_jammulai=?, lem_jamakhir=?, lem_keterangan=?, lem_foto=?, lem_poin=?, lem_durasi=? WHERE lem_nomor=?',
            [lem_kar_nik, lem_tanggal, lem_jammulai, lem_jamakhir, lem_keterangan, lem_foto || null, lem_poin, lem_durasi, req.params.id]
        )

        const [rows] = await pool.query('SELECT * FROM tlembur WHERE lem_nomor = ?', [req.params.id])
        success(res, rows[0], 'Data lembur berhasil diupdate')

    } catch (err) {
        next(err)
    }
}

/**
 * DELETE /api/lembur/:id
 * Delete lembur
 */
export const deleteLembur = async (req, res, next) => {
    try {
        const [existing] = await pool.query('SELECT * FROM tlembur WHERE lem_nomor = ?', [req.params.id])
        if (existing.length === 0) {
            return error(res, 'Data lembur tidak ditemukan', 404)
        }

        await pool.query('DELETE FROM tlembur WHERE lem_nomor = ?', [req.params.id])
        success(res, null, 'Data lembur berhasil dihapus')

    } catch (err) {
        next(err)
    }
}

/**
 * POST /api/lembur/upload
 * Proxy upload ke upload.php eksternal
 */
export const uploadFoto = async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'File tidak ditemukan' })
        }

        const formData = new FormData()
        formData.append('file', req.file.buffer, {
            filename: req.file.originalname,
            contentType: req.file.mimetype
        })
        formData.append('prefix', req.body.prefix || 'LM')

        const response = await fetch('http://103.103.22.7/cutikaryawan/upload.php', {
            method: 'POST',
            body: formData
        })

        const result = await response.json()
        res.json(result)

    } catch (err) {
        console.error('❌ Proxy upload error:', err)
        res.status(500).json({ success: false, message: 'Gagal upload melalui proxy' })
    }
}

/**
 * POST /api/lembur/batch
 * Insert batch lembur
 */
export const createLemburBatch = async (req, res, next) => {
    const conn = await pool.getConnection()
    try {
        const { lem_tanggal, lem_keterangan, lem_foto, rows } = req.body

        if (!lem_tanggal || !rows || rows.length === 0) {
            return error(res, 'Tanggal dan minimal 1 karyawan wajib diisi', 400)
        }

        await conn.beginTransaction()

        const results = []
        let counter = 1
        for (const row of rows) {
            // Generate nomor otomatis per baris
            const d = new Date(lem_tanggal)
            const yymm = d.getFullYear().toString().slice(2) + String(d.getMonth() + 1).padStart(2, '0')
            const prefix = `LEM.${yymm}.`

            const [maxRows] = await conn.query(
                'SELECT MAX(lem_nomor) AS maxNomor FROM tlembur WHERE lem_nomor LIKE ?',
                [`${prefix}%`]
            )

            let nextNum = 1
            if (maxRows[0]?.maxNomor) {
                const parts = maxRows[0].maxNomor.split('.')
                nextNum = parseInt(parts[2]) + counter
            } else {
                nextNum = counter
            }

            const lem_nomor = `${prefix}${String(nextNum).padStart(4, '0')}`

            await conn.query(
                'INSERT INTO tlembur (lem_nomor, lem_kar_nik, lem_tanggal, lem_jammulai, lem_jamakhir, lem_keterangan, lem_foto, lem_poin, lem_durasi) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [lem_nomor, row.nik, lem_tanggal, row.jamMulai, row.jamAkhir, row.keterangan || lem_keterangan, lem_foto || null, row.poin, row.durasi]
            )

            results.push({ lem_nomor, nik: row.nik })
            counter++
        }

        await conn.commit()
        success(res, results, `Berhasil menyimpan ${rows.length} data lembur`, 201)

    } catch (err) {
        await conn.rollback()
        next(err)
    } finally {
        conn.release()
    }
}