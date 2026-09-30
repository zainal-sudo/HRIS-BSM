import pool from '../config/database.js'
import { success, error, paginated } from '../helpers/response.js'
import { buildOrderBy, applyAllColumnFilters } from '../helpers/browse.js'
import { masaKerjaSQL } from '../helpers/masaKerja.js'
import { syncKaryawanToTarget, syncStatusToTarget, syncRekeningToTarget, targetForUnit } from '../helpers/syncKaryawan.js'

// Whitelist sort & filter kolom (alias frontend -> kolom SQL)
// Kolom tanggal dibungkus DATE_FORMAT agar konsisten 'YYYY-MM-DD' di
// sort, filter teks, filter checklist (IN), dan daftar distinct.
const DF = (col) => `DATE_FORMAT(${col}, '%Y-%m-%d')`

const BROWSE_COLUMNS = {
    NIK: 'a.kar_nik',
    Nama: 'a.kar_nama',
    Alamat: 'a.kar_alamat',
    Telp: 'a.kar_telp',
    NIK_KTP: 'a.kar_nik_ktp',
    Masuk: DF('a.kar_tgl_masuk'),
    TglKeluar: DF('a.kar_tgl_keluar'),
    TglAkhirKontrak: DF('a.kar_tglakhir_kontrak'),
    TempatLahir: 'a.kar_tempatlahir',
    TglLahir: DF('a.kar_tgllahir'),
    StatusPerkawinan: 'a.kar_Status',
    Jabatan: 'c.nm_jabat',
    Departmen: 'd.nm_dept',
    StatusKaryawan: 'a.kar_status_karyawan',
    Unit: 'b.nm_unit',
    Email: 'a.kar_email',
    Status: 'a.kar_status_aktif',
}

/**
 * Normalkan nilai filter kolom Status ke tinyint kar_status_aktif.
 * Kolom ditampilkan sebagai 'Aktif' / 'Tidak Aktif' (CASE di query),
 * jadi teks dari filter harus diubah lebih dulu agar tidak ter-coerce
 * diam-diam jadi 0 oleh MySQL.
 * @returns {'0'|'1'|null} null kalau nilainya tidak dikenal
 */
function normStatusAktif(value) {
    const s = String(value ?? '').trim().toLowerCase()
    if (!s) return null
    if (s === '0' || s.includes('tidak')) return '0'
    if (s === '1' || s.includes('aktif')) return '1'
    return null
}

/**
 * GET /api/karyawan
 * Get all karyawan dengan filter unit otomatis
 */
export const getAllKaryawan = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1
        const perPage = parseInt(req.query.per_page) || 25
        const search = req.query.search || ''
        const offset = (page - 1) * perPage

        let whereClause = ''
        const params = []

        // 🔥 Filter unit (sama seperti Delphi: WHERE kar_kd_unit LIKE '...')
        if (req.user.user.toLowerCase() !== 'pusat') {
            whereClause = ' WHERE a.kar_kd_unit = ?'
            params.push(req.user.kd_unit)
        } else {
            // Pusat lihat semua
            whereClause = ' WHERE 1=1'
        }

        // Search
        if (search) {
            whereClause += ` AND (a.kar_nama LIKE ? OR a.kar_nik LIKE ? OR d.nm_dept LIKE ? OR c.nm_jabat LIKE ?)`
            params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`)
        }

        // Query sesuai struktur Delphi (didefinisikan di awal karena dipakai
        // juga oleh cabang ?distinct= di bawah)
        const baseQuery = `
      SELECT 
        a.kar_nik AS NIK,
        a.kar_nama AS Nama,
        a.kar_alamat AS Alamat,
        a.kar_telp AS Telp,
        a.kar_nik_ktp AS NIK_KTP,
        a.kar_tgl_masuk AS Masuk,
        ${masaKerjaSQL('a.kar_tgl_masuk')} AS MasaKerja,
        a.kar_tgl_keluar AS TglKeluar,
        a.kar_tglakhir_kontrak AS TglAkhirKontrak,
        a.kar_tempatlahir AS TempatLahir,
        a.kar_tgllahir AS TglLahir,
        a.kar_Status AS StatusPerkawinan,
        c.nm_jabat AS Jabatan,
        d.nm_dept AS Departmen,
        kar_status_karyawan AS StatusKaryawan,
        b.nm_unit AS Unit,
        a.kar_email Email,
        CASE 
          WHEN a.kar_status_aktif = 1 THEN 'Aktif'
          ELSE 'Tidak Aktif'
        END AS Status
      FROM tkaryawan a
      LEFT JOIN tunit b ON b.kd_unit = a.kar_kd_unit
      LEFT JOIN tjabatan c ON c.kd_jabat = a.kar_kd_jabat
      LEFT JOIN tdept d ON d.kd_dept = a.kar_kd_dept
    `

        // Alias kolom tanggal -> diformat server-side agar 'YYYY-MM-DD'
        const DATE_ALIASES = new Set(['Masuk', 'TglKeluar', 'TglAkhirKontrak', 'TglLahir'])

        // Filter per kolom (?filter_Nama=, ...) + sorting (?sort_by=, ?sort_dir=)
        // Khusus Status (Aktif/Tidak Aktif): kolom tampil sebagai teks hasil CASE,
        // sedangkan kolom fisiknya tinyint 1/0 -> normalkan teks ke 1/0 supaya
        // filter teks (LIKE) maupun checklist (IN) sama-sama cocok.
        const browseQuery = { ...req.query }
        if (browseQuery.filter_Status !== undefined) {
            const v = normStatusAktif(browseQuery.filter_Status)
            if (v !== null) {
                browseQuery.filter_Status = v
            } else {
                delete browseQuery.filter_Status
            }
        }
        // Axios mengirim array sebagai filterSet_Status[]=...
        const setKey = browseQuery.filterSet_Status !== undefined
            ? 'filterSet_Status'
            : browseQuery['filterSet_Status[]'] !== undefined ? 'filterSet_Status[]' : null
        if (setKey) {
            const raw = browseQuery[setKey]
            const vals = [...new Set((Array.isArray(raw) ? raw : [raw])
                .map(normStatusAktif)
                .filter((v) => v !== null))]
            if (vals.length > 0) {
                browseQuery[setKey] = vals
            } else {
                delete browseQuery[setKey]
            }
        }
        const scopedWhere = whereClause
        const scopedParams = [...params]
        const filtered = applyAllColumnFilters(whereClause, params, browseQuery, BROWSE_COLUMNS)
        whereClause = filtered.clause
        const filteredParams = filtered.params
        const orderBy = buildOrderBy(req.query, BROWSE_COLUMNS, 'ORDER BY a.kar_nama ASC')

        // ?distinct=Nama -> daftar nilai unik untuk popup filter header
        // (menghormati search + filter kolom lain, mengabaikan kolom target)
        if (req.query.distinct && BROWSE_COLUMNS[req.query.distinct]) {
            const target = req.query.distinct
            const scoped = applyAllColumnFilters(scopedWhere, scopedParams, browseQuery, BROWSE_COLUMNS, target)
            const dsel = DATE_ALIASES.has(target)
                ? `DATE_FORMAT(sub.\`${target}\`, '%Y-%m-%d')`
                : `sub.\`${target}\``
            const [drows] = await pool.query(
                `SELECT DISTINCT ${dsel} AS value FROM (${baseQuery}${scoped.clause}) sub WHERE sub.\`${target}\` IS NOT NULL AND sub.\`${target}\` <> '' ORDER BY value LIMIT 500`,
                scoped.params
            )
            return success(res, drows.map((r) => r.value))
        }

        // Count total
        const [countResult] = await pool.query(
            `SELECT COUNT(*) as total FROM (${baseQuery}${whereClause}) as sub`,
            filteredParams
        )
        const total = countResult[0].total

        // Get data
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
 * GET /api/karyawan/:id
 * Get single karyawan by NIK
 */
export const getKaryawanById = async (req, res, next) => {
    try {
        const query = `
      SELECT 
        a.*,
        b.nm_unit,
        c.nm_jabat,
        d.nm_dept
      FROM tkaryawan a
      LEFT JOIN tunit b ON b.kd_unit = a.kar_kd_unit
      LEFT JOIN tjabatan c ON c.kd_jabat = a.kar_kd_jabat
      LEFT JOIN tdept d ON d.kd_dept = a.kar_kd_dept
      WHERE a.kar_nik = ?
    `
        const params = [req.params.id]

        // Filter unit
        // if (req.user.user.toLowerCase() !== 'pusat') {
        //   query += ' AND a.kar_kd_unit = ?'
        //   params.push(req.user.kd_unit)
        // }

        const [rows] = await pool.query(query, params)

        if (rows.length === 0) {
            return error(res, 'Karyawan tidak ditemukan', 404)
        }

        success(res, rows[0])

    } catch (err) {
        next(err)
    }
}

/**
 * POST /api/karyawan/generate-nik
 * Generate NIK otomatis berdasarkan kd_unit dan tgl_masuk
 * Format: kd_unit(2digit) + bulan(2digit) + tahun(4digit) + numerator(3digit)
 */
export const generateNik = async (req, res, next) => {
    try {
        const { kar_kd_unit, kar_tgl_masuk } = req.body

        if (!kar_kd_unit || !kar_tgl_masuk) {
            return error(res, 'Unit dan Tanggal Masuk harus diisi', 400)
        }

        const kdUnitPadded = String(kar_kd_unit).padStart(2, '0')
        const tgl = new Date(kar_tgl_masuk)
        const bulan = String(tgl.getMonth() + 1).padStart(2, '0')
        const tahun = tgl.getFullYear()
        const prefix = `${kdUnitPadded}${bulan}${tahun}`

        const [rows] = await pool.query(
            'SELECT kar_nik FROM tkaryawan WHERE kar_nik LIKE ? ORDER BY kar_nik DESC LIMIT 1',
            [`${prefix}%`]
        )

        let numerator = 1
        if (rows.length > 0) {
            const lastNik = rows[0].kar_nik
            const lastNum = parseInt(lastNik.slice(-3), 10)
            if (!isNaN(lastNum)) {
                numerator = lastNum + 1
            }
        }

        const nikBaru = `${prefix}${String(numerator).padStart(3, '0')}`

        success(res, { kar_nik: nikBaru })

    } catch (err) {
        next(err)
    }
}

/**
 * POST /api/karyawan
 * Create new karyawan
 */
export const createKaryawan = async (req, res, next) => {
    try {
        const data = { ...req.body }

        // Auto inject unit untuk non-pusat
        if (req.user.user.toLowerCase() !== 'pusat' && !data.kar_kd_unit) {
            data.kar_kd_unit = req.user.kd_unit
        }

        const [result] = await pool.query('INSERT INTO tkaryawan SET ?', data)

        // Return created data
        const [rows] = await pool.query(
            `SELECT 
        a.*,
        b.nm_unit,
        c.nm_jabat,
        d.nm_dept
      FROM tkaryawan a
      LEFT JOIN tunit b ON b.kd_unit = a.kar_kd_unit
      LEFT JOIN tjabatan c ON c.kd_jabat = a.kar_kd_jabat
      LEFT JOIN tdept d ON d.kd_dept = a.kar_kd_dept
      WHERE a.kar_nik = ?`,
            [data.kar_nik]
        )

        // 🔥 Auto-sync ke server 192.168.194.33 (fire-and-forget agar POST
        // tidak melambat oleh handshake ~10 detik ke server target; kegagalan
        // hanya dicatat di log dan bisa diulang via POST /api/karyawan/sync-target).
        // BSM (unit 1,2,3,4,5,10,11,12,13,14,17,18) -> hrd,
        // Entri (unit 6,20,21,26) -> hrd_entri, unit lain diskip.
        if (rows[0]) {
            syncKaryawanToTarget(rows[0])
                .then((r) => {
                    if (r.skipped) {
                        console.log(`⏭️  Sync skip ${data.kar_nik} (unit ${rows[0].kar_kd_unit} bukan BSM/Entri)`)
                    } else {
                        console.log(`✅ Sync ${data.kar_nik} -> ${r.target} (affected=${r.affectedRows})`)
                    }
                })
                .catch((e) => {
                    console.error(`❌ Sync gagal ${data.kar_nik}:`, e.message)
                })
        }

        success(res, rows[0], 'Karyawan berhasil ditambahkan', 201)

    } catch (err) {
        next(err)
    }
}

/**
 * PUT /api/karyawan/:id
 * Update karyawan
 */
export const updateKaryawan = async (req, res, next) => {
    try {
        // Cek exists
        const [existing] = await pool.query(
            'SELECT * FROM tkaryawan WHERE kar_nik = ?',
            [req.params.id]
        )

        if (existing.length === 0) {
            return error(res, 'Karyawan tidak ditemukan', 404)
        }

        // kar_nik adalah primary key — abaikan kalau ikut terkirim di body
        // agar tidak menimpa NIK milik karyawan lain (ER_DUP_ENTRY).
        const { kar_nik, ...body } = req.body || {}

        await pool.query(
            'UPDATE tkaryawan SET ? WHERE kar_nik = ?',
            [body, req.params.id]
        )

        // Return updated data
        const [rows] = await pool.query(
            `SELECT 
        a.*,
        b.nm_unit,
        c.nm_jabat,
        d.nm_dept
      FROM tkaryawan a
      LEFT JOIN tunit b ON b.kd_unit = a.kar_kd_unit
      LEFT JOIN tjabatan c ON c.kd_jabat = a.kar_kd_jabat
      LEFT JOIN tdept d ON d.kd_dept = a.kar_kd_dept
      WHERE a.kar_nik = ?`,
            [req.params.id]
        )

        // 🔥 Propagasi status aktif + tgl keluar ke 194.33 (fire-and-forget).
        // Tanpa ini karyawan yang dinonaktifkan di master VPS tetap aktif=1
        // di 194.33 dan terus muncul di Setting Gaji / Proses Gaji BSM.
        if (rows[0]) {
            syncStatusToTarget(rows[0])
                .then((r) => {
                    if (!r.skipped) {
                        console.log(`✅ Sync status ${req.params.id} -> ${r.target} (affected=${r.affectedRows})`)
                    }
                })
                .catch((e) => {
                    console.error(`❌ Sync status gagal ${req.params.id}:`, e.message)
                })
        }

        // 🔥 Propagasi nomor rekening ke 194.33 (kar_no_rekening ->
        // kar_rekeningbank) supaya Slip Gaji BSM/N3 ikut ter-update.
        // Skip otomatis kalau rekening di VPS kosong, supaya data yang
        // dikelola Delphi di 194.33 tidak tertimpa NULL.
        if (rows[0]) {
            syncRekeningToTarget(rows[0])
                .then((r) => {
                    if (r.skipped && r.reason === 'empty-vps') return
                    if (!r.skipped) {
                        console.log(`✅ Sync rekening ${req.params.id} -> ${r.target} = ${r.rekening} (affected=${r.affectedRows})`)
                    }
                })
                .catch((e) => {
                    console.error(`❌ Sync rekening gagal ${req.params.id}:`, e.message)
                })
        }

        success(res, rows[0], 'Karyawan berhasil diupdate')

    } catch (err) {
        next(err)
    }
}

/**
 * DELETE /api/karyawan/:id
 * Delete karyawan
 */
export const deleteKaryawan = async (req, res, next) => {
    try {
        const [existing] = await pool.query(
            'SELECT * FROM tkaryawan WHERE kar_nik = ?',
            [req.params.id]
        )

        if (existing.length === 0) {
            return error(res, 'Karyawan tidak ditemukan', 404)
        }

        await pool.query('DELETE FROM tkaryawan WHERE kar_nik = ?', [req.params.id])

        success(res, null, 'Karyawan berhasil dihapus')

    } catch (err) {
        next(err)
    }
}

/**
 * GET /api/karyawan/form-options
 * Get dropdown options (jabatan, departemen, unit)
 */
export const getFormOptions = async (req, res, next) => {
    try {
        let unitWhere = ''
        const unitParams = []

        if (req.user.user.toLowerCase() !== 'pusat') {
            unitWhere = ' WHERE kd_unit = ?'
            unitParams.push(req.user.kd_unit)
        }

        const [jabatan] = await pool.query('SELECT kd_jabat AS kode, nm_jabat AS nama FROM tjabatan ORDER BY nm_jabat')
        const [departemen] = await pool.query('SELECT kd_dept AS kode, nm_dept AS nama FROM tdept ORDER BY nm_dept')
        const [unit] = await pool.query(`SELECT kd_unit AS kode, nm_unit AS nama FROM tunit${unitWhere} ORDER BY nm_unit`, unitParams)

        success(res, {
            jabatan,
            departemen,
            unit
        })

    } catch (err) {
        next(err)
    }
}

/**
 * GET /api/lookup/unit
 */
export const getAllUnit = async (req, res, next) => {
    try {
        let query = 'SELECT kd_unit, nm_unit FROM tunit ORDER BY nm_unit'
        const params = []

        if (req.user.user.toLowerCase() !== 'pusat') {
            query = 'SELECT kd_unit, nm_unit FROM tunit WHERE kd_unit = ? ORDER BY nm_unit'
            params.push(req.user.kd_unit)
        }

        const [rows] = await pool.query(query, params)
        success(res, rows)
    } catch (err) {
        next(err)
    }
}

/**
 * GET /api/lookup/jabatan
 */
export const getAllJabatan = async (req, res, next) => {
    try {
        const [rows] = await pool.query('SELECT kd_jabat, nm_jabat FROM tjabatan ORDER BY nm_jabat')
        success(res, rows)
    } catch (err) {
        next(err)
    }
}

/**
 * GET /api/lookup/departemen
 */
export const getAllDepartemen = async (req, res, next) => {
    try {
        const [rows] = await pool.query('SELECT kd_dept, nm_dept FROM tdept ORDER BY nm_dept')
        success(res, rows)
    } catch (err) {
        next(err)
    }
}

/**
 * POST /api/karyawan/sync-target
 * Sinkronisasi manual/ulang dari VPS (103.103.22.7/hrd.tkaryawan)
 * ke server 192.168.194.33: unit BSM -> hrd, unit Entri -> hrd_entri.
 *
 * Body:
 * - nik: string | string[] (opsional, sinkronkan NIK tertentu)
 * - from_date: 'YYYY-MM-DD' (dipakai bila nik kosong; default '2026-08-20',
 *   filter: kar_tgl_masuk > from_date)
 * - dry_run: true -> hanya klasifikasi tanpa INSERT
 *
 * Loop sekuensial (server target sensitif koneksi konkuren baru).
 */
export const syncKaryawanTarget = async (req, res, next) => {
    try {
        const { nik, from_date = '2026-08-20', dry_run = false } = req.body || {}

        let rows
        if (nik !== undefined && nik !== null && nik !== '') {
            const list = [...new Set((Array.isArray(nik) ? nik : [nik]).map((v) => String(v).trim()).filter(Boolean))]
            if (list.length === 0) {
                return error(res, 'NIK tidak valid', 400)
            }
            const [r] = await pool.query(
                'SELECT * FROM tkaryawan WHERE kar_nik IN (?) ORDER BY kar_tgl_masuk',
                [list]
            )
            rows = r
        } else {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(String(from_date))) {
                return error(res, 'from_date harus format YYYY-MM-DD', 400)
            }
            const [r] = await pool.query(
                'SELECT * FROM tkaryawan WHERE kar_tgl_masuk > ? ORDER BY kar_tgl_masuk',
                [from_date]
            )
            rows = r
        }

        const summary = {
            total_vps: rows.length,
            inserted_hrd: 0,
            inserted_entri: 0,
            already_exists: 0,
            skipped_non_target: 0,
            dry_run: Boolean(dry_run),
            details: [],
        }

        for (const row of rows) {
            const target = targetForUnit(row.kar_kd_unit)
            if (!target) {
                summary.skipped_non_target++
                summary.details.push({ nik: row.kar_nik, nama: row.kar_nama, unit: row.kar_kd_unit, target: null, status: 'skipped' })
                continue
            }
            if (summary.dry_run) {
                summary.details.push({ nik: row.kar_nik, nama: row.kar_nama, unit: row.kar_kd_unit, target, status: 'would_sync' })
                continue
            }
            const r = await syncKaryawanToTarget(row)
            const inserted = (r.affectedRows ?? 0) > 0
            if (target === 'hrd') {
                if (inserted) summary.inserted_hrd++
                else summary.already_exists++
            } else {
                if (inserted) summary.inserted_entri++
                else summary.already_exists++
            }
            summary.details.push({
                nik: row.kar_nik, nama: row.kar_nama, unit: row.kar_kd_unit,
                target, status: inserted ? 'inserted' : 'already_exists',
            })
        }

        success(res, summary, dry_run ? 'Dry-run selesai (tanpa INSERT)' : 'Sinkronisasi selesai')
    } catch (err) {
        next(err)
    }
}