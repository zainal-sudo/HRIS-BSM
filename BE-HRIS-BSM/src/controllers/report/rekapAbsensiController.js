import pool from '../../config/database.js'
import { success, error } from '../../helpers/response.js'

export const getRekapAbsensi = async (req, res, next) => {
    try {
        // Ambil query parameter
        const startDate = req.query.start_date || null
        const endDate = req.query.end_date || null
        const additionalFilters = req.query.filters || null

        // Parse filters jika ada (JSON string)
        let filters = {}
        if (additionalFilters) {
            try {
                filters = JSON.parse(additionalFilters)
            } catch (e) {
                // ignore
            }
        }

        if (!startDate || !endDate) {
            return error(res, 'Tanggal start dan end wajib diisi', 400)
        }

        // Filter unit (pusat / unit)
        const unitFilter = req.user.user.toLowerCase() === 'pusat' ? '%' : req.user.kd_unit

        // Query untuk rekap absensi (panggil stored procedure)
        let query = 'CALL rekap_absensiv3(?, ?, ?)'
        const params = [startDate, endDate, unitFilter]

        // Eksekusi query
        const [rows] = await pool.query(query, params)

        // Hasil stored procedure ada di rows[0]
        const data = rows[0] || []

        // Return response
        success(res, data)

    } catch (err) {
        next(err)
    }
} 