import poolBsm from '../config/databaseBsm.js'
import poolEntri from '../config/databaseEntri.js'

// Klasifikasi unit VPS (tunit.kd_unit) -> database target di 192.168.194.33.
// BSM_*  -> hrd       (PT Bumi Sarana Maju + BSM Olshop)
// ENTRI_* -> hrd_entri (PT Entri Jaya Makmur grup)
// Unit lain (RotiQ 19,22-25,27,28 / Herbal 15 / Wedangan 16 / Kalirejo 7 /
// Bina Sarana 8-9, ...) -> null = tidak disinkronkan.
const BSM_UNITS = new Set(['1', '2', '3', '4', '5', '10', '11', '12', '13', '14', '17', '18'])
const ENTRI_UNITS = new Set(['6', '20', '21', '26'])

export function targetForUnit(kdUnit) {
    const u = String(kdUnit ?? '').trim()
    if (BSM_UNITS.has(u)) return 'hrd'
    if (ENTRI_UNITS.has(u)) return 'hrd_entri'
    return null
}

export const SYNC_SQL = `INSERT IGNORE INTO tkaryawan
  (kar_nik, kar_nama, kar_status_aktif, kar_tempatlahir, kar_kode_absensi,
   kar_tgllahir, kar_jenkel, kar_agama, kar_notelp, kar_pab_kode,
   kar_dep_kode, kar_jab_kode, kar_tgl_masuk, kar_sistem_gaji, kar_rekeningbank,
   date_create)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`

/**
 * Nama kolom rekening berbeda di kedua sisi:
 *  VPS (103.103.22.7) -> kar_no_rekening
 *  194.33             -> kar_rekeningbank (hrd & hrd_entri, varchar(30))
 */
export const REKENING_VPS = 'kar_no_rekening'
export const REKENING_TARGET = 'kar_rekeningbank'
export const REKENING_MAX_LEN = 30

/** Bersihkan nilai rekening: null/kosong/spasi -> null, maksimal 30 char */
export function normalizeRekening(v) {
    if (v === null || v === undefined) return null
    const s = String(v).trim()
    return s === '' ? null : s.slice(0, REKENING_MAX_LEN)
}

/**
 * Normalkan Date/string -> 'YYYY-MM-DD' ( dipakai ulang oleh
 * mapVpsToTarget dan syncStatusToTarget ).
 */
export function toSqlDate(v) {
    if (v === null || v === undefined || v === '') return null
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v
    const t = new Date(v)
    if (isNaN(t)) return null
    const y = t.getFullYear()
    const m = String(t.getMonth() + 1).padStart(2, '0')
    const d = String(t.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
}

/**
 * Petakan satu baris tkaryawan VPS (skema 103.103.22.7: kar_kd_unit,
 * kar_kd_jabat, kar_kd_dept, kar_telp, kar_jnskelamin, kar_registrasi, ...)
 * ke array parameter untuk SYNC_SQL (skema Delphi 194.33).
 *
 * Aturan mengikuti data yang sudah tersinkron sebelumnya:
 * - kar_kode_absensi = kar_registrasi
 * - kar_jenkel: Pria=1, Wanita=2, selain itu 0
 * - kar_agama kosong -> 'ISLAM'
 * - kar_notelp = kar_telp tanpa tanda kutip tunggal di depan
 * - kar_pab_kode = kar_kd_unit, kecuali unit 18 (Pusat) -> '0'
 * - tanggal dinormalkan ke 'YYYY-MM-DD' (menerima Date maupun string)
 */
export function mapVpsToTarget(row) {
    const jenkel =
        row.kar_jnskelamin === 'Pria' ? 1
        : row.kar_jnskelamin === 'Wanita' ? 2
        : 0
    const agama =
        row.kar_agama && String(row.kar_agama).trim() !== ''
            ? row.kar_agama
            : 'ISLAM'
    const notelp = row.kar_telp
        ? String(row.kar_telp).replace(/^'+/, '').trim() || null
        : null
    const pab =
        String(row.kar_kd_unit ?? '').trim() === '18'
            ? '0'
            : String(row.kar_kd_unit ?? '').trim() || null
    const dep =
        row.kar_kd_dept === null || row.kar_kd_dept === undefined || row.kar_kd_dept === ''
            ? null
            : String(row.kar_kd_dept)
    const jab =
        row.kar_kd_jabat === null || row.kar_kd_jabat === undefined || row.kar_kd_jabat === ''
            ? null
            : String(row.kar_kd_jabat)

    return [
        row.kar_nik,
        row.kar_nama,
        row.kar_status_aktif ?? 1,
        row.kar_tempatlahir || null,
        row.kar_registrasi || null,
        toSqlDate(row.kar_tgllahir),
        jenkel,
        agama,
        notelp,
        pab,
        dep,
        jab,
        toSqlDate(row.kar_tgl_masuk),
        row.kar_sistem_gaji || null,
        normalizeRekening(row[REKENING_VPS]),
        toSqlDate(row.date_create),
    ]
}

/**
 * Sinkronkan satu karyawan VPS ke 194.33.
 * @returns {Promise<{skipped:boolean, target?:string, affectedRows?:number}>}
 * Tidak melempar untuk kasus skip; melempar bila query target gagal
 * (pemanggil yang menentukan: diabaikan untuk auto-sync, diteruskan
 * sebagai error untuk endpoint manual).
 */
export async function syncKaryawanToTarget(vpsRow) {
    const target = targetForUnit(vpsRow.kar_kd_unit)
    if (!target) return { skipped: true }
    const params = mapVpsToTarget(vpsRow)
    const pool = target === 'hrd' ? poolBsm : poolEntri
    const [res] = await pool.queryWithRetry(SYNC_SQL, params)
    return { skipped: false, target, affectedRows: res.affectedRows }
}

/**
 * Propagasi status aktif + tanggal keluar VPS ke 194.33.
 * Dipakai setiap ada perubahan status di VPS: transaksi Karyawan Keluar
 * (tkeluar insert/update/delete -> trigger VPS mengisi kar_tgl_keluar &
 * kar_status_aktif) dan edit master karyawan (PUT /api/karyawan/:id).
 *
 * Tanpa ini, karyawan yang sudah keluar tetap kar_status_aktif=1 di
 * 194.33 sehingga terus muncul di Setting Gaji BSM & Proses Gaji BSM
 * yang filtternya kar_status_aktif=1.
 *
 * @returns {Promise<{skipped:boolean, target?:string, affectedRows?:number}>}
 */
export async function syncStatusToTarget(vpsRow) {
    const target = targetForUnit(vpsRow.kar_kd_unit)
    if (!target) return { skipped: true }
    // VPS mengenal status selain 0/1 (mis. 2); di Delphi 194.33 hanya
    // 1 yang berarti aktif, sisanya dianggap tidak aktif.
    const aktif = Number(vpsRow.kar_status_aktif) === 1 ? 1 : 0
    const tglKeluar = toSqlDate(vpsRow.kar_tgl_keluar)
    const pool = target === 'hrd' ? poolBsm : poolEntri
    const [res] = await pool.queryWithRetry(
        'UPDATE tkaryawan SET kar_status_aktif = ?, kar_tgl_keluar = ? WHERE kar_Nik = ?',
        [aktif, tglKeluar, vpsRow.kar_nik]
    )
    return { skipped: false, target, affectedRows: res.affectedRows }
}

/**
 * Propagasi nomor rekening VPS -> 194.33 (kar_no_rekening -> kar_rekeningbank).
 * Dipakai setiap edit master karyawan (PUT /api/karyawan/:id) supaya Slip Gaji
 * BSM/N3 yang membaca kar_rekeningbank ikut ter-update.
 *
 * 🔒 SANGAT PENTING: rekening HANYA diteruskan kalau di VPS sudah terisi.
 * Kalau nilainya kosong, fungsi ini return skipped tanpa menyentuh 194.33.
 * Alasannya: data rekening 194.33 dikelola dari Delphi dan saat ini hanya
 * ada di sisi sana (VPS kosong untuk semua unit BSM/Entri). Tanpa pengaman
 * ini, setiap edit karyawan BSM/N3 di web akan menimpa 185 rekening yang
 * sudah ada di 194.33 dengan NULL — kehilangan data. Mengosongkan rekening
 * dari web memang tidak disengaja; harus lewat Delphi.
 *
 * @returns {Promise<{skipped:boolean, reason?:string, target?:string, affectedRows?:number}>}
 */
export async function syncRekeningToTarget(vpsRow) {
    const target = targetForUnit(vpsRow.kar_kd_unit)
    if (!target) return { skipped: true, reason: 'no-target' }

    const rekening = normalizeRekening(vpsRow[REKENING_VPS])
    if (!rekening) return { skipped: true, reason: 'empty-vps' }

    const pool = target === 'hrd' ? poolBsm : poolEntri
    const [res] = await pool.queryWithRetry(
        `UPDATE tkaryawan SET ${REKENING_TARGET} = ? WHERE kar_Nik = ?`,
        [rekening, vpsRow.kar_nik]
    )
    return { skipped: false, target, affectedRows: res.affectedRows, rekening }
}
