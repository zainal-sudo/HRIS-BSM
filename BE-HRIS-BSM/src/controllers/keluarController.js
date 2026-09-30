import pool from '../config/database.js'
import { success, error, paginated } from '../helpers/response.js'
import { buildOrderBy, applyAllColumnFilters } from '../helpers/browse.js'
import { syncStatusToTarget } from '../helpers/syncKaryawan.js'

/**
 * Propagasi status karyawan VPS ke 194.33 (fire-and-forget).
 * Dipanggil setelah tkeluar berubah; trigger VPS sudah mengisi
 * kar_tgl_keluar & kar_status_aktif di tkaryawan, jadi baca ulang
 * barisnya lalu teruskan ke target (hrd / hrd_entri).
 */
function propagateStatusKeluar(karNik) {
    if (!karNik) return
    pool.query('SELECT * FROM tkaryawan WHERE kar_nik = ?', [karNik])
        .then(([rows]) => {
            if (rows.length === 0) return null
            return syncStatusToTarget(rows[0])
        })
        .then((r) => {
            if (r && !r.skipped) {
                console.log(`✅ Sync status keluar ${karNik} -> ${r.target} (affected=${r.affectedRows})`)
            }
        })
        .catch((e) => {
            console.error(`❌ Sync status keluar gagal ${karNik}:`, e.message)
        })
}

// Whitelist sort & filter kolom (alias frontend -> kolom SQL)
// Kolom tanggal dibungkus DATE_FORMAT agar konsisten 'YYYY-MM-DD'.
const DF = (col) => `DATE_FORMAT(${col}, '%Y-%m-%d')`
const BROWSE_COLUMNS = {
    Nomor: 'a.kl_nomor',
    Tanggal: DF('a.kl_tanggal'),
    NIK: 'a.kl_nik',
    Nama: 'b.kar_nama',
    Jabatan: 'c.nm_jabat',
    Departemen: 'd.nm_dept',
    Unit: 'e.nm_unit',
    Alasan: 'a.kl_alasan',
    Keterangan: 'a.kl_ket',
}
const DATE_ALIASES = new Set(['Tanggal'])

/**
 * GET /api/keluar
 * Browse karyawan keluar dengan filter tanggal dan unit
 */
export const getAllKeluar = async (req, res, next) => {
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
            whereClause += ` AND a.kl_tanggal BETWEEN ? AND ?`
            params.push(startDate, endDate)
        }

        // Search
        if (search) {
            whereClause += ` AND (a.kl_nomor LIKE ? OR b.kar_nik LIKE ? OR b.kar_nama LIKE ?)`
            params.push(`%${search}%`, `%${search}%`, `%${search}%`)
        }

        const baseQuery = `
      SELECT 
        a.kl_nomor AS Nomor,
        a.kl_tanggal AS Tanggal,
        a.kl_nik AS NIK,
        b.kar_nama AS Nama,
        c.nm_jabat AS Jabatan,
        d.nm_dept AS Departemen,
        e.nm_unit AS Unit,
        a.kl_alasan AS Alasan,
        a.kl_ket AS Keterangan
      FROM tkeluar a
      LEFT JOIN tkaryawan b ON a.kl_nik = b.kar_nik
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
        const orderBy = buildOrderBy(req.query, BROWSE_COLUMNS, 'ORDER BY a.kl_tanggal DESC')

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
 * GET /api/keluar/max-kode
 * Generate nomor keluar otomatis: KEL.yyyymm.xxxx
 */
export const getMaxKode = async (req, res, next) => {
    try {
        const tanggal = req.query.tanggal || new Date().toISOString().split('T')[0]
        const d = new Date(tanggal)
        const yyyymm = d.getFullYear().toString() + String(d.getMonth() + 1).padStart(2, '0')
        const prefix = `KEL.${yyyymm}.`

        const [rows] = await pool.query(
            'SELECT MAX(kl_nomor) AS maxNomor FROM tkeluar WHERE kl_nomor LIKE ?',
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
 * GET /api/keluar/:id
 * Get single keluar by kl_nomor
 */
export const getKeluarById = async (req, res, next) => {
    try {
        const [rows] = await pool.query(
            'SELECT * FROM tkeluar WHERE kl_nomor = ?',
            [req.params.id]
        )

        if (rows.length === 0) {
            return error(res, 'Data tidak ditemukan', 404)
        }

        success(res, rows[0])

    } catch (err) {
        next(err)
    }
}

/**
 * GET /api/keluar/karyawan/:nik
 * Detail karyawan (Nama, Dept, Jabatan)
 */
export const getDetailKaryawan = async (req, res, next) => {
    try {
        const [rows] = await pool.query(
            `SELECT a.kar_nama, b.nm_dept, c.nm_jabat
       FROM tkaryawan a
       LEFT JOIN tdept b ON a.kar_kd_dept = b.kd_dept
       LEFT JOIN tjabatan c ON a.kar_kd_jabat = c.kd_jabat
       WHERE a.kar_nik = ?`,
            [req.params.nik]
        )

        if (rows.length === 0) {
            return error(res, 'Karyawan tidak ditemukan', 404)
        }

        success(res, rows[0])

    } catch (err) {
        next(err)
    }
}

/**
 * POST /api/keluar
 * Create new keluar
 */
export const createKeluar = async (req, res, next) => {
    try {
        const { kl_nomor, kl_tanggal, kl_nik, kl_alasan, kl_ket } = req.body

        if (!kl_nik || !kl_tanggal || !kl_alasan) {
            return error(res, 'NIK, tanggal, dan alasan wajib diisi', 400)
        }

        const [result] = await pool.query(
            'INSERT INTO tkeluar (kl_nomor, kl_tanggal, kl_nik, kl_alasan, kl_ket) VALUES (?, ?, ?, ?, ?)',
            [kl_nomor, kl_tanggal, kl_nik, kl_alasan, kl_ket || '']
        )

        const [rows] = await pool.query('SELECT * FROM tkeluar WHERE kl_nomor = ?', [kl_nomor])

        // Trigger VPS mengisi kar_tgl_keluar & kar_status_aktif -> teruskan ke 194.33
        propagateStatusKeluar(kl_nik)

        success(res, rows[0], 'Data berhasil disimpan', 201)

    } catch (err) {
        next(err)
    }
}

/**
 * PUT /api/keluar/:id
 * Update keluar
 */
export const updateKeluar = async (req, res, next) => {
    try {
        const { kl_tanggal, kl_nik, kl_alasan, kl_ket } = req.body

        // Simpan NIK lama: kalau NIK diganti, status kedua NIK harus dipropagasi
        const [before] = await pool.query('SELECT kl_nik FROM tkeluar WHERE kl_nomor = ?', [req.params.id])
        const oldNik = before.length > 0 ? before[0].kl_nik : null

        await pool.query(
            'UPDATE tkeluar SET kl_tanggal=?, kl_nik=?, kl_alasan=?, kl_ket=? WHERE kl_nomor=?',
            [kl_tanggal, kl_nik, kl_alasan, kl_ket || '', req.params.id]
        )

        const [rows] = await pool.query('SELECT * FROM tkeluar WHERE kl_nomor = ?', [req.params.id])

        propagateStatusKeluar(kl_nik)
        if (oldNik && oldNik !== kl_nik) propagateStatusKeluar(oldNik)

        success(res, rows[0], 'Data berhasil diupdate')

    } catch (err) {
        next(err)
    }
}

/**
 * DELETE /api/keluar/:id
 * Delete keluar
 */
export const deleteKeluar = async (req, res, next) => {
    try {
        const [existing] = await pool.query('SELECT * FROM tkeluar WHERE kl_nomor = ?', [req.params.id])
        if (existing.length === 0) {
            return error(res, 'Data tidak ditemukan', 404)
        }

        await pool.query('DELETE FROM tkeluar WHERE kl_nomor = ?', [req.params.id])

        // Trigger DELETE VPS mengosongkan kar_tgl_keluar -> teruskan ke 194.33
        propagateStatusKeluar(existing[0].kl_nik)

        success(res, null, 'Data berhasil dihapus')

    } catch (err) {
        next(err)
    }
}