import pool from '../config/database.js'
import { success, error, paginated } from '../helpers/response.js'

/**
 * 🔥 REUSABLE CRUD FACTORY
 * 
 * Cara pakai:
 * const getAll = (tableName, unitField?) => ...
 * Auto filter unit (kecuali user pusat)
 */

export const getAll = (tableName, unitField = 'kd_unit') => async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1
        const perPage = parseInt(req.query.per_page) || 10
        const search = req.query.search || ''
        const offset = (page - 1) * perPage

        let whereClause = ''
        const params = []

        // 🔥 Auto filter unit (kecuali user pusat)
        if (req.user.user.toLowerCase() !== 'pusat') {
            whereClause = ` WHERE ${unitField} = ?`
            params.push(req.user.kd_unit)
        }

        // Search
        if (search) {
            const searchClause = whereClause ? ' AND' : ' WHERE'
            whereClause += `${searchClause} (nama LIKE ? OR kode LIKE ?)`
            params.push(`%${search}%`, `%${search}%`)
        }

        // Count
        const [countResult] = await pool.query(
            `SELECT COUNT(*) as total FROM ${tableName}${whereClause}`,
            [...params]
        )
        const total = countResult[0].total

        // Data
        const [rows] = await pool.query(
            `SELECT * FROM ${tableName}${whereClause} LIMIT ? OFFSET ?`,
            [...params, perPage, offset]
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

export const getById = (tableName, primaryKey = 'id', unitField = 'kd_unit') => async (req, res, next) => {
    try {
        let query = `SELECT * FROM ${tableName} WHERE ${primaryKey} = ?`
        const params = [req.params.id]

        if (req.user.user.toLowerCase() !== 'pusat') {
            query += ` AND ${unitField} = ?`
            params.push(req.user.kd_unit)
        }

        const [rows] = await pool.query(query, params)

        if (rows.length === 0) {
            return error(res, 'Data tidak ditemukan', 404)
        }

        success(res, rows[0])

    } catch (err) {
        next(err)
    }
}

export const create = (tableName, unitField = 'kd_unit') => async (req, res, next) => {
    try {
        const data = { ...req.body }

        // Auto inject kd_unit untuk user non-pusat
        if (req.user.user.toLowerCase() !== 'pusat' && !data[unitField]) {
            data[unitField] = req.user.kd_unit
        }

        const [result] = await pool.query(`INSERT INTO ${tableName} SET ?`, data)

        // Return inserted data
        const [rows] = await pool.query(`SELECT * FROM ${tableName} WHERE id = ?`, [result.insertId])

        success(res, rows[0] || { id: result.insertId, ...data }, 'Data berhasil ditambahkan', 201)

    } catch (err) {
        next(err)
    }
}

export const update = (tableName, primaryKey = 'id', unitField = 'kd_unit') => async (req, res, next) => {
    try {
        // Cek data exists & punya akses
        let checkQuery = `SELECT * FROM ${tableName} WHERE ${primaryKey} = ?`
        const checkParams = [req.params.id]

        if (req.user.user.toLowerCase() !== 'pusat') {
            checkQuery += ` AND ${unitField} = ?`
            checkParams.push(req.user.kd_unit)
        }

        const [existing] = await pool.query(checkQuery, checkParams)
        if (existing.length === 0) {
            return error(res, 'Data tidak ditemukan', 404)
        }

        await pool.query(`UPDATE ${tableName} SET ? WHERE ${primaryKey} = ?`, [req.body, req.params.id])

        const [rows] = await pool.query(`SELECT * FROM ${tableName} WHERE ${primaryKey} = ?`, [req.params.id])

        success(res, rows[0], 'Data berhasil diupdate')

    } catch (err) {
        next(err)
    }
}

export const remove = (tableName, primaryKey = 'id', unitField = 'kd_unit') => async (req, res, next) => {
    try {
        let checkQuery = `SELECT * FROM ${tableName} WHERE ${primaryKey} = ?`
        const checkParams = [req.params.id]

        if (req.user.user.toLowerCase() !== 'pusat') {
            checkQuery += ` AND ${unitField} = ?`
            checkParams.push(req.user.kd_unit)
        }

        const [existing] = await pool.query(checkQuery, checkParams)
        if (existing.length === 0) {
            return error(res, 'Data tidak ditemukan', 404)
        }

        await pool.query(`DELETE FROM ${tableName} WHERE ${primaryKey} = ?`, [req.params.id])

        success(res, null, 'Data berhasil dihapus')

    } catch (err) {
        next(err)
    }
}