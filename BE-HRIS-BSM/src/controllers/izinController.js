import pool from '../config/database.js'
import { success, error, paginated } from '../helpers/response.js'
import { buildOrderBy, applyAllColumnFilters } from '../helpers/browse.js'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Whitelist sort & filter kolom (alias frontend -> kolom SQL)
// Kolom tanggal dibungkus DATE_FORMAT agar konsisten 'YYYY-MM-DD'.
const DF = (col) => `DATE_FORMAT(${col}, '%Y-%m-%d')`
const BROWSE_COLUMNS = {
    Nomor: 'a.ij_nomor',
    NIK: 'a.kar_nik',
    Nama: 'b.kar_nama',
    Jabatan: 'c.nm_jabat',
    Departmen: 'd.nm_dept',
    Unit: 'e.nm_unit',
    Tanggal: DF('a.tanggal'),
    Alasan: 'a.alasan',
    Keterangan: 'a.keterangan',
}
const DATE_ALIASES = new Set(['Tanggal'])

/**
 * GET /api/izin
 * Browse izin dengan filter tanggal dan unit
 */
export const getAllIzin = async (req, res, next) => {
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
            whereClause += ` AND a.tanggal BETWEEN ? AND ?`
            params.push(startDate, endDate)
        }

        // Search
        if (search) {
            whereClause += ` AND (a.ij_nomor LIKE ? OR b.kar_nik LIKE ? OR b.kar_nama LIKE ?)`
            params.push(`%${search}%`, `%${search}%`, `%${search}%`)
        }

        const baseQuery = `
      SELECT 
        a.ij_nomor AS Nomor,
        a.kar_nik AS NIK,
        b.kar_nama AS Nama,
        c.nm_jabat AS Jabatan,
        d.nm_dept AS Departmen,
        e.nm_unit AS Unit,
        a.tanggal AS Tanggal,
        a.alasan AS Alasan,
        a.keterangan AS Keterangan,
        a.ij_foto AS foto
      FROM tijin a
      LEFT JOIN tkaryawan b ON a.kar_nik = b.kar_nik
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
        const orderBy = buildOrderBy(req.query, BROWSE_COLUMNS, 'ORDER BY a.tanggal DESC')

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

        // Count
        const [countResult] = await pool.query(
            `SELECT COUNT(*) as total FROM (${baseQuery}${whereClause}) as sub`,
            filteredParams
        )
        const total = countResult[0].total

        // Data
        const [rows] = await pool.query(
            `${baseQuery}${whereClause} ${orderBy} LIMIT ? OFFSET ?`,
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
 * GET /api/izin/max-kode
 * Generate nomor izin otomatis: IJN.yymm.xxxx
 */
export const getMaxKode = async (req, res, next) => {
    try {
        const tanggal = req.query.tanggal || new Date().toISOString().split('T')[0]
        const d = new Date(tanggal)
        const yymm = d.getFullYear().toString().slice(2) + String(d.getMonth() + 1).padStart(2, '0')
        const prefix = `IJN.${yymm}.`

        const [rows] = await pool.query(
            'SELECT MAX(ij_nomor) AS maxNomor FROM tijin WHERE ij_nomor LIKE ?',
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
 * GET /api/izin/:id
 * Get single izin by ij_nomor
 */
export const getIzinById = async (req, res, next) => {
    try {
        const [rows] = await pool.query(
            'SELECT * FROM tijin WHERE ij_nomor = ?',
            [req.params.id]
        )

        if (rows.length === 0) {
            return error(res, 'Data izin tidak ditemukan', 404)
        }

        success(res, rows[0])

    } catch (err) {
        next(err)
    }
}

/**
 * GET /api/izin/karyawan/:nik
 * Detail karyawan + sisa cuti + absensi
 */
export const getDetailKaryawan = async (req, res, next) => {
    try {
        const nik = req.params.nik
        const tanggal = req.query.tanggal || new Date().toISOString().split('T')[0]

        // Detail karyawan + tgl_masuk
        const query = `
      SELECT 
        a.kar_nama,
        b.nm_dept,
        c.nm_jabat,
        u.kd_unit,
        a.kar_tgl_masuk
      FROM tkaryawan a
      LEFT JOIN tdept b ON a.kar_kd_dept = b.kd_dept
      LEFT JOIN tjabatan c ON a.kar_kd_jabat = c.kd_jabat
      LEFT JOIN tunit u ON u.kd_unit = a.kar_kd_unit
      WHERE a.kar_nik = ?
    `

        const [rows] = await pool.query(query, [nik])

        if (rows.length === 0) {
            return error(res, 'Karyawan tidak ditemukan', 404)
        }

        // Cek masa kerja ≥ 1 tahun
        let sisaCuti = 0
        if (rows[0].kar_tgl_masuk) {
            const tglMasuk = new Date(rows[0].kar_tgl_masuk)
            const satuTahunLalu = new Date()
            satuTahunLalu.setFullYear(satuTahunLalu.getFullYear() - 1)
            if (tglMasuk <= satuTahunLalu) {
                // ≥ 1 tahun: hitung sisa cuti kueri
                const [cutiRows] = await pool.query(
                    `SELECT 12 - COUNT(*) AS sisa FROM tijin WHERE kar_nik = ? AND alasan = 'Cuti Tahunan' AND YEAR(tanggal) = YEAR(CURDATE())`,
                    [nik]
                )
                sisaCuti = cutiRows[0].sisa
            }
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
            kar_nama: rows[0].kar_nama,
            nm_dept: rows[0].nm_dept,
            nm_jabat: rows[0].nm_jabat,
            sisa_cuti: sisaCuti,
            absensi: absenRows[0] || { Jam_in: null, Jam_out: null }
        })

    } catch (err) {
        next(err)
    }
}

/**
 * GET /api/izin/alasan-options
 * Options untuk combo box alasan
 */
export const getAlasanOptions = async (req, res, next) => {
    try {
        const [rows] = await pool.query(
            'SELECT ji_id AS Kode, ji_keterangan AS Alasan FROM tjenisijin ORDER BY ji_keterangan'
        )
        success(res, rows)
    } catch (err) {
        next(err)
    }
}

/**
 * POST /api/izin
 * Create new izin
 */
export const createIzin = async (req, res, next) => {
    try {
        const { ij_nomor, kar_nik, tanggal, alasan, keterangan, ij_foto, ij_shift } = req.body

        if (!kar_nik || !tanggal || !alasan) {
            return error(res, 'NIK, tanggal, dan alasan wajib diisi', 400)
        }

        // Cek saldo cuti jika alasan = Cuti Tahunan
        if (alasan === 'Cuti Tahunan') {
            const [rows] = await pool.query(
                `SELECT 
          12 
            - COALESCE((SELECT COUNT(*) FROM tharilibur WHERE hl_ispotongcuti = 1 AND YEAR(hl_tanggal) = YEAR(CURDATE())), 0)
            - COALESCE((SELECT COUNT(*) FROM tijin WHERE kar_nik = ? AND alasan = 'Cuti Tahunan' AND YEAR(tanggal) = YEAR(CURDATE())), 0)
            AS sisa_cuti`,
                [kar_nik]
            )
            if (rows[0]?.sisa_cuti <= 0) {
                return error(res, 'Saldo cuti tidak mencukupi', 400)
            }
        }

        const [result] = await pool.query(
            'INSERT INTO tijin (ij_nomor, kar_nik, tanggal, alasan, keterangan, ij_foto, ij_shift) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [ij_nomor, kar_nik, tanggal, alasan, keterangan, ij_foto || null, ij_shift || 0]
        )

        const [rows] = await pool.query('SELECT * FROM tijin WHERE ij_nomor = ?', [ij_nomor])
        success(res, rows[0], 'Data izin berhasil disimpan', 201)

    } catch (err) {
        next(err)
    }
}

/**
 * PUT /api/izin/:id
 * Update izin
 */
export const updateIzin = async (req, res, next) => {
    try {
        const { kar_nik, tanggal, alasan, keterangan, ij_foto, ij_shift } = req.body

        // Cek saldo cuti jika alasan = Cuti Tahunan
        if (alasan === 'Cuti Tahunan') {
            const [rows] = await pool.query(
                `SELECT 
          12 
            - COALESCE((SELECT COUNT(*) FROM tharilibur WHERE hl_ispotongcuti = 1 AND YEAR(hl_tanggal) = YEAR(CURDATE())), 0)
            - COALESCE((SELECT COUNT(*) FROM tijin WHERE kar_nik = ? AND alasan = 'Cuti Tahunan' AND YEAR(tanggal) = YEAR(CURDATE())), 0)
            AS sisa_cuti`,
                [kar_nik]
            )
            if (rows[0]?.sisa_cuti <= 0) {
                return error(res, 'Saldo cuti tidak mencukupi', 400)
            }
        }

        await pool.query(
            'UPDATE tijin SET kar_nik=?, tanggal=?, alasan=?, keterangan=?, ij_foto=?, ij_shift=? WHERE ij_nomor=?',
            [kar_nik, tanggal, alasan, keterangan, ij_foto || null, ij_shift || 0, req.params.id]
        )

        const [rows] = await pool.query('SELECT * FROM tijin WHERE ij_nomor = ?', [req.params.id])
        success(res, rows[0], 'Data izin berhasil diupdate')

    } catch (err) {
        next(err)
    }
}

/**
 * DELETE /api/izin/:id
 * Delete izin
 */
export const deleteIzin = async (req, res, next) => {
    try {
        const [existing] = await pool.query('SELECT * FROM tijin WHERE ij_nomor = ?', [req.params.id])
        if (existing.length === 0) {
            return error(res, 'Data izin tidak ditemukan', 404)
        }

        await pool.query('DELETE FROM tijin WHERE ij_nomor = ?', [req.params.id])
        success(res, null, 'Data izin berhasil dihapus')

    } catch (err) {
        next(err)
    }
}

/**
 * POST /api/izin/upload
 * Upload foto ke upload.php
 */
export const uploadFoto = async (req, res, next) => {
    try {
        if (!req.files || !req.files.file) {
            return error(res, 'File tidak ditemukan', 400)
        }

        const file = req.files.file
        const prefix = req.body.prefix || 'IZ'
        const ext = path.extname(file.name)
        const filename = `${prefix}_${Date.now()}${ext}`
        const uploadDir = path.join(__dirname, '../../public/uploads/')
        const filePath = path.join(uploadDir, filename)

        // Pastikan folder ada
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true })
        }

        // Simpan file
        await file.mv(filePath)

        success(res, {
            filename,
            url: `/uploads/${filename}`
        }, 'Upload berhasil')

    } catch (err) {
        next(err)
    }
}

export const createIzinBatch = async (req, res, next) => {
    const conn = await pool.getConnection()
    try {
        const { kar_nik, alasan, keterangan, foto, tanggal_list } = req.body

        if (!kar_nik || !alasan || !tanggal_list || tanggal_list.length === 0) {
            return error(res, 'NIK, alasan, dan minimal 1 tanggal wajib diisi', 400)
        }

        // Cek saldo cuti
        if (alasan === 'Cuti Tahunan') {
            const [rows] = await pool.query(
                `SELECT 
          12 
            - COALESCE((SELECT COUNT(*) FROM tharilibur WHERE hl_ispotongcuti = 1 AND YEAR(hl_tanggal) = YEAR(CURDATE())), 0)
            - COALESCE((SELECT COUNT(*) FROM tijin WHERE kar_nik = ? AND alasan = 'Cuti Tahunan' AND YEAR(tanggal) = YEAR(CURDATE())), 0)
            AS sisa_cuti`,
                [kar_nik]
            )
            if (rows[0]?.sisa_cuti < tanggal_list.length) {
                return error(res, 'Saldo cuti tidak mencukupi', 400)
            }
        }

        await conn.beginTransaction()

        const results = []
        for (let i = 0; i < tanggal_list.length; i++) {
            const tanggal = tanggal_list[i]
            const d = new Date(tanggal)
            const yymm = d.getFullYear().toString().slice(2) + String(d.getMonth() + 1).padStart(2, '0')
            const prefix = `IJN.${yymm}.`

            const [maxRows] = await conn.query(
                'SELECT MAX(ij_nomor) AS maxNomor FROM tijin WHERE ij_nomor LIKE ?',
                [`${prefix}%`]
            )

            let nextNum = 1
            if (maxRows[0]?.maxNomor) {
                const parts = maxRows[0].maxNomor.split('.')
                nextNum = parseInt(parts[2]) + 1
            }

            const ij_nomor = `${prefix}${String(nextNum).padStart(4, '0')}`

            await conn.query(
                'INSERT INTO tijin (ij_nomor, kar_nik, tanggal, alasan, keterangan, ij_foto) VALUES (?, ?, ?, ?, ?, ?)',
                [ij_nomor, kar_nik, tanggal, alasan, keterangan, foto || null]
            )

            results.push({ ij_nomor, tanggal })
        }

        await conn.commit()
        success(res, results, `Berhasil menyimpan ${tanggal_list.length} data izin`, 201)

    } catch (err) {
        await conn.rollback()
        next(err)
    } finally {
        conn.release()
    }
}