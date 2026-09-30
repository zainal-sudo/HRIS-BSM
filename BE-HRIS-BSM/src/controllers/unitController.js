import pool from '../config/database.js'
import { success, error, paginated } from '../helpers/response.js'
import { buildOrderBy, applyAllColumnFilters } from '../helpers/browse.js'

// Whitelist sort & filter kolom (alias frontend -> kolom SQL)
const BROWSE_COLUMNS = {
    Kode: 'kd_unit',
    Nama: 'nm_unit',
}

/**
 * GET /api/unit
 * Get all unit dengan filter unit otomatis
 */
export const getAllUnit = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1
        const perPage = parseInt(req.query.per_page) || 25
        const search = req.query.search || ''
        const offset = (page - 1) * perPage

        let whereClause = ''
        const params = []

        // 🔥 Auto filter unit (kecuali user pusat)
        if (req.user.user.toLowerCase() !== 'pusat') {
            whereClause = ' WHERE kd_unit = ?'
            params.push(req.user.kd_unit)
        }

        // Search
        if (search) {
            const searchClause = whereClause ? ' AND' : ' WHERE'
            whereClause += `${searchClause} (kd_unit LIKE ? OR nm_unit LIKE ?)`
            params.push(`%${search}%`, `%${search}%`)
        }

        // Filter per kolom (?filter_Nama=teks, ?filterSet_Nama=a&filterSet_Nama=b) + sorting (?sort_by=, ?sort_dir=)
        const scopedWhere = whereClause
        const scopedParams = [...params]
        const filtered = applyAllColumnFilters(whereClause, params, req.query, BROWSE_COLUMNS)
        whereClause = filtered.clause
        const filteredParams = filtered.params
        const orderBy = buildOrderBy(req.query, BROWSE_COLUMNS, 'ORDER BY nm_unit')

        // ?distinct=Nama -> daftar nilai unik untuk popup filter header
        if (req.query.distinct && BROWSE_COLUMNS[req.query.distinct]) {
            const target = req.query.distinct
            const dcol = BROWSE_COLUMNS[target]
            const scoped = applyAllColumnFilters(scopedWhere, scopedParams, req.query, BROWSE_COLUMNS, target)
            const dwhere = scoped.clause ? `${scoped.clause} AND` : 'WHERE'
            const [drows] = await pool.query(
                `SELECT DISTINCT ${dcol} AS value FROM tunit ${dwhere} ${dcol} IS NOT NULL AND ${dcol} <> '' ORDER BY value LIMIT 500`,
                scoped.params
            )
            return success(res, drows.map((r) => r.value))
        }

        // Count
        const [countResult] = await pool.query(
            `SELECT COUNT(*) as total FROM tunit${whereClause}`,
            [...filteredParams]
        )
        const total = countResult[0].total

        // Data
        const [rows] = await pool.query(
            `SELECT kd_unit AS Kode, nm_unit AS Nama FROM tunit${whereClause} ${orderBy} LIMIT ? OFFSET ?`,
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
 * GET /api/unit/:id
 * Get single unit by kd_unit
 */
export const getUnitById = async (req, res, next) => {
    try {
        const [rows] = await pool.query(
            'SELECT kd_unit AS Kode, nm_unit AS Nama FROM tunit WHERE kd_unit = ?',
            [req.params.id]
        )

        if (rows.length === 0) {
            return error(res, 'Unit tidak ditemukan', 404)
        }

        success(res, rows[0])

    } catch (err) {
        next(err)
    }
}

/**
 * POST /api/unit
 * Create new unit (kode auto increment manual karena kd_unit varchar PK tanpa auto_increment)
 */
export const createUnit = async (req, res, next) => {
    try {
        const { Nama } = req.body

        if (!Nama || Nama.trim() === '') {
            return error(res, 'Nama unit wajib diisi', 400)
        }

        // kd_unit varchar(10) PK tanpa auto_increment -> generate MAX+1
        const [maxRows] = await pool.query(
            'SELECT COALESCE(MAX(CAST(kd_unit AS UNSIGNED)), 0) AS maxKode FROM tunit'
        )
        const nextKode = String((maxRows[0]?.maxKode || 0) + 1)

        const [existing] = await pool.query(
            'SELECT kd_unit FROM tunit WHERE kd_unit = ?',
            [nextKode]
        )
        if (existing.length > 0) {
            return error(res, `Kode unit ${nextKode} sudah dipakai`, 409)
        }

        await pool.query(
            'INSERT INTO tunit (kd_unit, nm_unit) VALUES (?, ?)',
            [nextKode, Nama.trim()]
        )

        const [rows] = await pool.query(
            'SELECT kd_unit AS Kode, nm_unit AS Nama FROM tunit WHERE kd_unit = ?',
            [nextKode]
        )

        success(res, rows[0], 'Unit berhasil ditambahkan', 201)

    } catch (err) {
        next(err)
    }
}

/**
 * PUT /api/unit/:id
 * Update unit
 */
export const updateUnit = async (req, res, next) => {
    try {
        const { Nama } = req.body

        if (!Nama || Nama.trim() === '') {
            return error(res, 'Nama unit wajib diisi', 400)
        }

        // Cek exists
        const [existing] = await pool.query(
            'SELECT * FROM tunit WHERE kd_unit = ?',
            [req.params.id]
        )

        if (existing.length === 0) {
            return error(res, 'Unit tidak ditemukan', 404)
        }

        await pool.query(
            'UPDATE tunit SET nm_unit = ? WHERE kd_unit = ?',
            [Nama.trim(), req.params.id]
        )

        const [rows] = await pool.query(
            'SELECT kd_unit AS Kode, nm_unit AS Nama FROM tunit WHERE kd_unit = ?',
            [req.params.id]
        )

        success(res, rows[0], 'Unit berhasil diupdate')

    } catch (err) {
        next(err)
    }
}

/**
 * DELETE /api/unit/:id
 * Delete unit
 */
export const deleteUnit = async (req, res, next) => {
    try {
        // Cek exists
        const [existing] = await pool.query(
            'SELECT * FROM tunit WHERE kd_unit = ?',
            [req.params.id]
        )

        if (existing.length === 0) {
            return error(res, 'Unit tidak ditemukan', 404)
        }

        await pool.query('DELETE FROM tunit WHERE kd_unit = ?', [req.params.id])

        success(res, null, 'Unit berhasil dihapus')

    } catch (err) {
        next(err)
    }
}