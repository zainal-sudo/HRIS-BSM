import pool from '../../config/database.js'
import { success, error } from '../../helpers/response.js'

export const getLaporanAbsensi = async (req, res, next) => {
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

        // Query SQL dengan parameter
        let query = `
      WITH RECURSIVE dates AS (
        SELECT DATE(?) AS dt
        UNION ALL
        SELECT DATE_ADD(dt, INTERVAL 1 DAY)
        FROM dates
        WHERE dt < DATE(?)
      ),
      base_absen AS (
        SELECT
          d.dt,
          emp.kar_nik,
          MIN(CASE WHEN e.status_absen = 1 THEN e.tanggal END) AS jam_in,
          MAX(CASE WHEN e.status_absen IN (1,2) THEN e.tanggal END) AS jam_out
        FROM dates d
        CROSS JOIN (SELECT DISTINCT kar_nik FROM tabsensitampung WHERE kar_nik <> '') emp
        LEFT JOIN tkaryawan x ON x.kar_nik = emp.kar_nik
        LEFT JOIN tabsensitampung e ON DATE(e.tanggal) = d.dt AND e.kar_nik = emp.kar_nik
        GROUP BY d.dt, emp.kar_nik
      ),
      status_dasar AS (
        SELECT
          b.dt,
          b.kar_nik,
          b.jam_in,
          b.jam_out,
          x.kar_nama,
          y.nm_jabat,
          z.nm_unit,
          z.jam_kerja,
          l.hl_tanggal,
          CASE
            WHEN z.jam_kerja = 'shift full' THEN
              CASE
                WHEN b.jam_in IS NULL AND b.jam_out IS NULL THEN 'Potong Gaji'
                ELSE 'Masuk'
              END
            WHEN z.jam_kerja = 'shift libur' THEN
              CASE
                WHEN l.hl_tanggal IS NOT NULL OR DAYNAME(b.dt) IN ('Saturday','Sunday') THEN ''
                WHEN b.jam_in IS NULL AND b.jam_out IS NULL THEN 'Potong Gaji'
                ELSE 'Masuk'
              END
            ELSE
              CASE
                WHEN l.hl_tanggal IS NOT NULL THEN ''
                WHEN b.jam_in IS NULL AND b.jam_out IS NULL THEN 'Potong Gaji'
                WHEN z.kd_unit <> '20' AND TIME(b.jam_in) >= '08:01:00' THEN 'Terlambat'
                ELSE 'Masuk'
              END
          END AS keterangan
        FROM base_absen b
        LEFT JOIN tkaryawan x ON x.kar_nik = b.kar_nik AND x.kar_pengecualian = 0 AND x.kar_status_aktif = 1
        LEFT JOIN tjabatan y ON x.kar_kd_jabat = y.kd_jabat
        LEFT JOIN tunit z ON z.kd_unit = x.kar_kd_unit
        LEFT JOIN tharilibur l ON l.hl_tanggal = b.dt
        WHERE x.kar_kd_unit LIKE ?
      )
      SELECT
        DATE_FORMAT(s.dt, '%Y-%m-%d') AS Tanggal,
        DAYNAME(s.dt) AS Hari,
        s.kar_nik AS Nik,
        s.kar_nama AS Nama,
        s.nm_jabat AS Jabatan,
        s.nm_unit AS Nama_Unit,
        DATE_FORMAT(s.jam_in, '%H:%i') AS Jam_in,
        DATE_FORMAT(s.jam_out, '%H:%i') AS Jam_out,
        s.keterangan AS Keterangan,
        COALESCE(i.alasan, s.keterangan) AS Payroll,
        i.ij_nomor AS NoIjin,
        i.ij_foto AS foto,
        i.keterangan AS KeteranganIjin
      FROM status_dasar s
      LEFT JOIN tijin i ON i.kar_nik = s.kar_nik AND DATE(i.tanggal) = s.dt
      ORDER BY s.kar_nik, s.dt
    `

        // Parameter query
        const params = [startDate, endDate, unitFilter]

        // Tambahkan filter tambahan jika ada
        if (filters.Nama) {
            query += ` AND s.kar_nama LIKE ?`
            params.push(`%${filters.Nama}%`)
        }
        if (filters.Unit) {
            query += ` AND s.nm_unit LIKE ?`
            params.push(`%${filters.Unit}%`)
        }
        if (filters.Jabatan) {
            query += ` AND s.nm_jabat LIKE ?`
            params.push(`%${filters.Jabatan}%`)
        }

        // Eksekusi query
        const [rows] = await pool.query(query, params)

        // Hitung summary (opsional)
        const totalData = rows.length
        const totalMasuk = rows.filter(r => r.Keterangan === 'Masuk').length
        const totalTerlambat = rows.filter(r => r.Keterangan === 'Terlambat').length
        const totalPotongGaji = rows.filter(r => r.Keterangan === 'Potong Gaji').length

        // Return response
        success(res, rows, {
            summary: {
                total_data: totalData,
                total_masuk: totalMasuk,
                total_terlambat: totalTerlambat,
                total_potong_gaji: totalPotongGaji
            }
        })

    } catch (err) {
        next(err)
    }
}