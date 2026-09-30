import pool from '../../config/database.js'
import { success, error } from '../../helpers/response.js'
import { masaKerjaSQL } from '../../helpers/masaKerja.js'

/**
 * GET /api/report/kontrak-berakhir
 */
export const getReportKontrak = async (req, res, next) => {
    try {
        let whereClause = ` WHERE kar_tglakhir_kontrak IS NOT NULL 
                        AND kar_tglakhir_kontrak <= DATE_ADD(CURDATE(), INTERVAL 60 DAY)
                        AND kar_status_aktif = 1 and kar_status_karyawan like '%kontrak%' `
        const params = []

        // Filter unit (non-pusat)
        if (req.user.user.toLowerCase() !== 'pusat') {
            whereClause += ' AND kar_kd_unit = ?'
            params.push(req.user.kd_unit)
        }

        const query = `
  SELECT 
    kar_nik AS NIK,
    kar_nama AS Nama,
    nm_jabat AS Jabatan,
    nm_dept AS Departmen,
    nm_unit AS Unit,
    DATE_FORMAT(kar_tgl_masuk, '%Y-%m-%d') AS TanggalMasuk,
    DATE_FORMAT(kar_tglakhir_kontrak, '%Y-%m-%d') AS BerakhirKontrak,
    MONTHNAME(kar_tglakhir_kontrak) AS BulanKontrak,
    DATEDIFF(kar_tglakhir_kontrak, CURDATE()) AS SisaHari,
    kar_status_pkwt AS StatusPKWT,
    kar_pkwt AS PKWT,
    kar_tempatlahir AS TempatLahir,
    DATE_FORMAT(kar_tgllahir, '%Y-%m-%d') AS TglLahir,
    kar_alamat AS Alamat,
    DATE_FORMAT(kar_tgl_masuk, '%Y-%m-%d') AS TglMasuk,
    ${masaKerjaSQL('kar_tgl_masuk')} AS MasaKerja,
    CASE WHEN TIMESTAMPDIFF(YEAR, kar_tgl_masuk, CURDATE()) >= 3 THEN 'Ya' ELSE 'Tidak' END AS MasaKerja3Tahun
  FROM tkaryawan
  LEFT JOIN tjabatan ON kd_jabat = kar_kd_jabat
  LEFT JOIN tdept ON kd_dept = kar_kd_dept
  LEFT JOIN tunit ON kd_unit = kar_kd_unit
  ${whereClause}
  ORDER BY BerakhirKontrak ASC
`

        const [rows] = await pool.query(query, params)
        success(res, rows)

    } catch (err) {
        next(err)
    }
}

/**
 * PUT /api/kontrak/update-status
 */
export const updateStatusPkwt = async (req, res, next) => {
    try {
        const { niks, status } = req.body

        if (!niks || !Array.isArray(niks) || niks.length === 0) {
            return error(res, 'NIKs diperlukan', 400)
        }

        const placeholders = niks.map(() => '?').join(',')
        await pool.query(
            `UPDATE tkaryawan SET kar_status_pkwt = ? WHERE kar_nik IN (${placeholders})`,
            [status, ...niks]
        )

        success(res, null, `Status ${niks.length} karyawan diupdate`)

    } catch (err) { next(err) }
}