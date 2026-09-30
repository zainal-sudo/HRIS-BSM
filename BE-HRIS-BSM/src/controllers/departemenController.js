import pool from '../config/database.js'
import { success, error, paginated } from '../helpers/response.js'
import { buildOrderBy, applyAllColumnFilters } from '../helpers/browse.js'

// Whitelist sort & filter kolom (alias frontend -> kolom SQL)
const BROWSE_COLUMNS = {
    Kode: 'kd_dept',
    Nama: 'nm_dept',
}

/**
 * GET /api/departemen
 * Get all departemen dengan filter unit otomatis
 */
export const getAllDepartemen = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1
        const perPage = parseInt(req.query.per_page) || 25
        const search = req.query.search || ''
        const offset = (page - 1) * perPage

        let whereClause = ''
        const params = []

        // Catatan: tdept tidak punya kolom kd_unit (master global),
        // jadi tidak ada filter unit per user — semua user melihat data yang sama.

        // Search
        if (search) {
            whereClause += ` WHERE (kd_dept LIKE ? OR nm_dept LIKE ?)`
            params.push(`%${search}%`, `%${search}%`)
        }

        // Filter per kolom (?filter_Nama=teks, ?filterSet_Nama=a&filterSet_Nama=b) + sorting (?sort_by=, ?sort_dir=)
        const scopedWhere = whereClause
        const scopedParams = [...params]
        const filtered = applyAllColumnFilters(whereClause, params, req.query, BROWSE_COLUMNS)
        whereClause = filtered.clause
        const filteredParams = filtered.params
        const orderBy = buildOrderBy(req.query, BROWSE_COLUMNS, 'ORDER BY nm_dept')

        // ?distinct=Nama -> daftar nilai unik untuk popup filter header
        if (req.query.distinct && BROWSE_COLUMNS[req.query.distinct]) {
            const target = req.query.distinct
            const dcol = BROWSE_COLUMNS[target]
            const scoped = applyAllColumnFilters(scopedWhere, scopedParams, req.query, BROWSE_COLUMNS, target)
            const dwhere = scoped.clause ? `${scoped.clause} AND` : 'WHERE'
            const [drows] = await pool.query(
                `SELECT DISTINCT ${dcol} AS value FROM tdept ${dwhere} ${dcol} IS NOT NULL AND ${dcol} <> '' ORDER BY value LIMIT 500`,
                scoped.params
            )
            return success(res, drows.map((r) => r.value))
        }

        // Count
        const [countResult] = await pool.query(
            `SELECT COUNT(*) as total FROM tdept${whereClause}`,
            [...filteredParams]
        )
        const total = countResult[0].total

        // Data
        const [rows] = await pool.query(
            `SELECT kd_dept AS Kode, nm_dept AS Nama FROM tdept${whereClause} ${orderBy} LIMIT ? OFFSET ?`,
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
 * GET /api/departemen/:id
 * Get single departemen by kd_dept
 */
export const getDepartemenById = async (req, res, next) => {
    try {
        const [rows] = await pool.query(
            'SELECT kd_dept AS Kode, nm_dept AS Nama FROM tdept WHERE kd_dept = ?',
            [req.params.id]
        )

        if (rows.length === 0) {
            return error(res, 'Departemen tidak ditemukan', 404)
        }

        success(res, rows[0])

    } catch (err) {
        next(err)
    }
}

/**
 * POST /api/departemen
 * Create new departemen
 */
export const createDepartemen = async (req, res, next) => {
    try {
        const { Nama } = req.body

        if (!Nama || Nama.trim() === '') {
            return error(res, 'Nama departemen wajib diisi', 400)
        }

        const [result] = await pool.query(
            'INSERT INTO tdept (nm_dept) VALUES (?)',
            [Nama.trim()]
        )

        const [rows] = await pool.query(
            'SELECT kd_dept AS Kode, nm_dept AS Nama FROM tdept WHERE kd_dept = ?',
            [result.insertId]
        )

        success(res, rows[0], 'Departemen berhasil ditambahkan', 201)

    } catch (err) {
        next(err)
    }
}

/**
 * PUT /api/departemen/:id
 * Update departemen
 */
export const updateDepartemen = async (req, res, next) => {
    try {
        const { Nama } = req.body

        if (!Nama || Nama.trim() === '') {
            return error(res, 'Nama departemen wajib diisi', 400)
        }

        // Cek exists
        const [existing] = await pool.query(
            'SELECT * FROM tdept WHERE kd_dept = ?',
            [req.params.id]
        )

        if (existing.length === 0) {
            return error(res, 'Departemen tidak ditemukan', 404)
        }

        await pool.query(
            'UPDATE tdept SET nm_dept = ? WHERE kd_dept = ?',
            [Nama.trim(), req.params.id]
        )

        const [rows] = await pool.query(
            'SELECT kd_dept AS Kode, nm_dept AS Nama FROM tdept WHERE kd_dept = ?',
            [req.params.id]
        )

        success(res, rows[0], 'Departemen berhasil diupdate')

    } catch (err) {
        next(err)
    }
}

/**
 * DELETE /api/departemen/:id
 * Delete departemen
 */
export const deleteDepartemen = async (req, res, next) => {
    try {
        // Cek exists
        const [existing] = await pool.query(
            'SELECT * FROM tdept WHERE kd_dept = ?',
            [req.params.id]
        )

        if (existing.length === 0) {
            return error(res, 'Departemen tidak ditemukan', 404)
        }

        await pool.query('DELETE FROM tdept WHERE kd_dept = ?', [req.params.id])

        success(res, null, 'Departemen berhasil dihapus')

    } catch (err) {
        next(err)
    }
}