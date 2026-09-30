import poolEntri from '../config/databaseEntri.js'
import poolUtama from '../config/database.js'
import { success, error } from '../helpers/response.js'
import { kirimSlipPdf, smtpTransporter } from '../helpers/smtp.js'

/**
 * PROSES GAJI N3 (PT Entri Jaya Makmur, unit 6)
 * Duplikasi form Delphi ufrmProsesGaji dari D:\program\hrd N3 dengan
 * database di server 192.168.194.33 / hrd_entri.
 *
 * Perbedaan dengan Proses Gaji BSM:
 *  - Tunjangan: T. Jabatan, T. Kompetensi, T. Makan (kar_T_MAKAN),
 *    T. Transport (kar_T_HADIR). Tidak ada T. Absensi & Pot. Jabatan.
 *  - Ada Poin -> Lembur = poin*(gapok+tjabatan+tmakan+transport)/173.
 *  - Ada Simpanan Pokok & Sisa Angsuran (kolom manual).
 *  - Ambil Absensi Delphi (rekap_absensiv2) mengisi Terlambat, Pot. Hari,
 *    dan Poin; Tidak Masuk diisi manual. Server hrd_entri tidak punya
 *    routine rekap, jadi Terlambat & Pot. Hari ditarik dari rekap
 *    server utama (seperti BSM), sedangkan Poin & Tidak Masuk manual.
 *
 * Rumus total (persis Delphi N3):
 *   lembur      = poin * (gapok+tunjab+t makan+t transport) / 173
 *   dasar       = gapok + tunjab + tkompetensi + tmakan + ttransport + lembur
 *   potongan    = bpjs + bpjstk + koperasi + angsuran
 *                 + (terlambat x 5000)
 *                 + (potong_hari x (gapok+tunjab+tmakan+ttransport+tkompetensi) / 25)
 *                 + (tidak_masuk x (tmakan+ttransport) / 25)
 *                 + pph21
 *   total       = dasar - potongan
 */

/** Hanya karyawan PT Entri Jaya Makmur (kode unit 6) */
const FILTER_UNIT_N3 = "k.kar_pab_kode = '6'"

/** Ubah apa pun jadi angka, nilai kosong/rusak -> 0 */
const num = (v) => {
    const n = Number(v)
    return isNaN(n) ? 0 : n
}

/** Hitung lembur & rincian potongan + total satu baris (aturan Delphi N3) */
export function hitungGajiN3(r) {
    const gapok = num(r.gapok)
    const tkompetensi = num(r.tkompetensi)
    const tjabatan = num(r.tjabatan)
    const tmakan = num(r.tmakan)
    const transport = num(r.transport)
    const poin = num(r.poin)
    const bpjstk = num(r.bpjstk)
    const bpjs = num(r.bpjs)
    const koperasi = num(r.koperasi)
    const tidakmasuk = num(r.tidakmasuk)
    const terlambat = num(r.terlambat)
    const potonghari = num(r.potonghari)
    const angsuran = num(r.angsuran)
    const pph21 = num(r.pph21)

    const lembur = poin * (gapok + tjabatan + tmakan + transport) / 173
    const dasar = gapok + tjabatan + tkompetensi + tmakan + transport + lembur
    const potTerlambat = terlambat * 5000
    const potHarikerja = potonghari * (gapok + tjabatan + tmakan + transport + tkompetensi) / 25
    const potTidakmasuk = tidakmasuk * (tmakan + transport) / 25
    const potongan = bpjs + bpjstk + koperasi + angsuran
        + potTerlambat + potHarikerja + potTidakmasuk + pph21
    const total = dasar - potongan

    return { lembur, dasar, potTerlambat, potHarikerja, potTidakmasuk, potongan, total }
}

/**
 * GET /api/gaji-n3/karyawan
 * Master karyawan aktif unit 6 (sistem Harian/Bulanan, gapok > 0).
 * Setara InsertNilai di Delphi N3.
 */
export const getKaryawanN3 = async (req, res, next) => {
    try {
        const [rows] = await poolEntri.queryWithRetry(
            `SELECT
        k.kar_Nik AS nik,
        k.kar_nama AS nama,
        COALESCE(j.jab_nama, '') AS jabatan,
        COALESCE(d.dep_nama, '') AS departemen,
        COALESCE(p.pab_nama, '') AS unit,
        COALESCE(k.kar_GAPOK, 0) AS gapok,
        COALESCE(k.kar_T_KOMPETENSI, 0) AS tkompetensi,
        COALESCE(k.kar_T_JABATAN, 0) AS tjabatan,
        COALESCE(k.kar_T_MAKAN, 0) AS tmakan,
        COALESCE(k.kar_T_HADIR, 0) AS transport,
        COALESCE(k.kar_T_bpjstk, 0) AS bpjstk,
        COALESCE(k.kar_T_BPJS, 0) AS bpjs,
        COALESCE(k.kar_t_koperasi, 0) AS koperasi,
        COALESCE(k.kar_T_PPH21, 0) AS pph21,
        COALESCE(k.kar_rekeningbank, '') AS rekening,
        COALESCE(k.kar_email, '') AS email
      FROM tkaryawan k
      LEFT JOIN tjabatan j ON j.jab_kode = k.kar_jab_kode
      LEFT JOIN tdepartemen d ON d.dep_kode = k.kar_dep_kode
      LEFT JOIN tpabrik p ON p.pab_kode = k.kar_pab_kode
      WHERE k.kar_status_aktif = 1
        AND k.kar_sistem_gaji IN ('Harian', 'Bulanan')
        AND k.kar_GAPOK > 0
        AND ${FILTER_UNIT_N3}
      ORDER BY k.kar_Nik`
        )

        success(res, rows, `${rows.length} karyawan aktif PT Entri Jaya Makmur dimuat`)

    } catch (err) {
        next(err)
    }
}

/**
 * GET /api/gaji-n3/absensi?start_date=&end_date=
 * Rekap absensi server utama, dibatasi NIK unit 6 yang aktif.
 * Delphi N3 mengisi Terlambat, Pot. Hari (+ Poin dari routine yang
 * tidak ada di server); Tidak Masuk & Poin diisi manual di web.
 */
export const getAbsensiN3 = async (req, res, next) => {
    try {
        const startDate = String(req.query.start_date || '').trim()
        const endDate = String(req.query.end_date || '').trim()

        if (!startDate || !endDate) {
            return error(res, 'Rentang tanggal absensi wajib diisi', 400)
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
            return error(res, 'Format tanggal harus YYYY-MM-DD', 400)
        }
        if (startDate > endDate) {
            return error(res, 'Tanggal awal tidak boleh melewati tanggal akhir', 400)
        }

        // NIK yang boleh masuk proses gaji N3 (unit 6, aktif)
        const [nikRows] = await poolEntri.queryWithRetry(
            `SELECT k.kar_Nik AS nik
       FROM tkaryawan k
       WHERE k.kar_status_aktif = 1
         AND k.kar_sistem_gaji IN ('Harian', 'Bulanan')
         AND k.kar_GAPOK > 0
         AND ${FILTER_UNIT_N3}`
        )
        const nikN3 = new Set(nikRows.map((r) => String(r.nik).trim()))

        const [result] = await poolUtama.query('CALL rekap_absensiv3(?, ?, ?)', [startDate, endDate, '%'])
        const semua = (Array.isArray(result?.[0]) ? result[0] : (Array.isArray(result) ? result : []))
            .filter((r) => r && nikN3.has(String(r.Nik).trim()))

        const rows = semua.map((r) => {
            const tidakMasuk = num(r.CutiTahunan) + num(r.Sakit) + num(r.CutiKhusus)
            return {
                nik: String(r.Nik).trim(),
                nama: r.Nama || '',
                unit: r.Cabang || '',
                hari: num(r.Hari),
                setengahHari: num(r.SetengahHari),
                masuk: num(r.Masuk),
                terlambat: num(r.Terlambat),
                tidakmasuk: tidakMasuk,
                potonghari: num(r.Potong_Gaji),
                keterangan: r.Keterangan || '',
            }
        })

        const tanpaData = [...nikN3].filter((n) => !rows.some((r) => r.nik === n))

        success(res, {
            start_date: startDate,
            end_date: endDate,
            rows,
            jumlah: rows.length,
            tanpaData,
            totalNik: nikN3.size,
        }, `Rekap absensi ${rows.length} dari ${nikN3.size} karyawan PT Entri Jaya Makmur` +
            (tanpaData.length > 0 ? `, ${tanpaData.length} karyawan tanpa data absensi` : ''))

    } catch (err) {
        next(err)
    }
}

/**
 * GET /api/gaji-n3?periode=&tahun=
 * Data gaji N3 yang sudah tersimpan pada satu periode.
 * Setara InsertNilai2 di Delphi N3.
 */
export const getGajiN3 = async (req, res, next) => {
    try {
        const periode = parseInt(req.query.periode)
        const tahun = parseInt(req.query.tahun)

        if (!periode || periode < 1 || periode > 12) {
            return error(res, 'Periode (bulan) tidak valid', 400)
        }
        if (!tahun || tahun < 2000 || tahun > 2100) {
            return error(res, 'Tahun tidak valid', 400)
        }

        const [rows] = await poolEntri.queryWithRetry(
            `SELECT
        g.gb_nik AS nik,
        g.gb_nama AS nama,
        g.gb_jabatan AS jabatan,
        COALESCE(d.dep_nama, '') AS departemen,
        g.gb_unit AS unit,
        COALESCE(g.gb_gapok, 0) AS gapok,
        COALESCE(g.gb_tunjangankompetensi, 0) AS tkompetensi,
        COALESCE(g.gb_tunjanganjabatan, 0) AS tjabatan,
        COALESCE(g.gb_tunjanganmakan, 0) AS tmakan,
        COALESCE(g.gb_tunjangantransport, 0) AS transport,
        COALESCE(g.gb_poin, 0) AS poin,
        COALESCE(g.gb_bpjstk, 0) AS bpjstk,
        COALESCE(g.gb_bpjs, 0) AS bpjs,
        COALESCE(g.gb_koperasi, 0) AS koperasi,
        COALESCE(g.gb_haritidakmasuk, 0) AS tidakmasuk,
        COALESCE(g.gb_hariterlambat, 0) AS terlambat,
        COALESCE(g.gb_potonganhari, 0) AS potonghari,
        COALESCE(g.gb_angsuran, 0) AS angsuran,
        COALESCE(g.gb_pph21, 0) AS pph21,
        COALESCE(g.gb_simpananpokok, 0) AS simpananpokok,
        COALESCE(g.gb_sisaangsuran, 0) AS sisaangsuran,
        COALESCE(k.kar_rekeningbank, '') AS rekening,
        COALESCE(k.kar_email, '') AS email
      FROM tgajibulanan g
      LEFT JOIN tkaryawan k ON k.kar_Nik = g.gb_nik
      LEFT JOIN tdepartemen d ON d.dep_kode = k.kar_dep_kode
      WHERE g.gb_periode = ? AND g.gb_tahun = ?
      ORDER BY g.gb_nik`,
            [periode, tahun]
        )

        const hitung = rows.map((r) => ({ ...r, ...hitungGajiN3(r) }))

        success(res, {
            periode,
            tahun,
            rows: hitung,
            jumlah: hitung.length,
        }, hitung.length > 0
            ? `${hitung.length} data gaji N3 periode ${periode}/${tahun} dimuat`
            : `Belum ada data gaji N3 tersimpan untuk periode ${periode}/${tahun}`)

    } catch (err) {
        next(err)
    }
}

/**
 * POST /api/gaji-n3/simpan
 * Simpan hasil proses: hapus dulu periode tsb, lalu insert ulang
 * (persis seperti simpandata di Delphi N3) dalam satu transaksi.
 * tgajibulanan hrd_entri hanya berisi PT Entri Jaya Makmur.
 */
export const simpanGajiN3 = async (req, res, next) => {
    const conn = await poolEntri.getConnectionWithRetry()

    try {
        const periode = parseInt(req.body?.periode)
        const tahun = parseInt(req.body?.tahun)
        const rows = Array.isArray(req.body?.rows) ? req.body.rows : []

        if (!periode || periode < 1 || periode > 12) {
            return error(res, 'Periode (bulan) tidak valid', 400)
        }
        if (!tahun || tahun < 2000 || tahun > 2100) {
            return error(res, 'Tahun tidak valid', 400)
        }

        const isi = rows.filter((r) => String(r?.nik || '').trim() !== '')
        if (isi.length === 0) {
            return error(res, 'Tidak ada data untuk disimpan', 400)
        }

        // Cegah NIK ganda dalam satu payload
        const nikUnique = new Set()
        for (const r of isi) {
            const nik = String(r.nik).trim()
            if (nikUnique.has(nik)) {
                return error(res, `NIK ${nik} muncul lebih dari sekali`, 400)
            }
            nikUnique.add(nik)
        }

        await conn.beginTransaction()

        await conn.query('DELETE FROM tgajibulanan WHERE gb_periode = ? AND gb_tahun = ?', [periode, tahun])

        const values = isi.map((r) => [
            periode,
            tahun,
            String(r.nik).trim(),
            String(r.nama || ''),
            String(r.unit || ''),
            String(r.jabatan || ''),
            num(r.gapok),
            num(r.tjabatan),
            num(r.tkompetensi),
            num(r.tmakan),
            num(r.transport),
            num(r.bpjstk),
            num(r.bpjs),
            num(r.koperasi),
            num(r.tidakmasuk),
            num(r.terlambat),
            num(r.potonghari),
            num(r.angsuran),
            num(r.pph21),
            num(r.poin),
            num(r.simpananpokok),
            num(r.sisaangsuran),
        ])

        const CHUNK = 200
        for (let i = 0; i < values.length; i += CHUNK) {
            const slice = values.slice(i, i + CHUNK)
            const placeholders = slice.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ')
            await conn.query(
                `INSERT INTO tgajibulanan
          (gb_periode, gb_tahun, gb_nik, gb_nama, gb_unit, gb_jabatan,
           gb_gapok, gb_tunjanganjabatan, gb_tunjangankompetensi,
           gb_tunjanganmakan, gb_tunjangantransport,
           gb_bpjstk, gb_bpjs, gb_koperasi, gb_haritidakmasuk, gb_hariterlambat,
           gb_potonganhari, gb_angsuran, gb_pph21, gb_poin, gb_simpananpokok, gb_sisaangsuran)
        VALUES ${placeholders}`,
                slice.flat()
            )
        }

        await conn.commit()

        success(res, { periode, tahun, jumlah: isi.length },
            `Gaji N3 periode ${periode}/${tahun} berhasil disimpan (${isi.length} karyawan)`)

    } catch (err) {
        try { await conn.rollback() } catch { /* abaikan */ }
        next(err)
    } finally {
        conn.release()
    }
}

/**
 * GET /api/gaji-n3/smtp-test
 * Cek konfigurasi & koneksi SMTP tanpa mengirim email.
 */
export const tesSmtpN3 = async (req, res, next) => {
    try {
        const transporter = smtpTransporter()
        if (!transporter) {
            return error(res, 'Konfigurasi SMTP belum diisi di server (SMTP_HOST/SMTP_USER/SMTP_PASS)', 500)
        }
        await transporter.verify()
        success(res, null, 'Koneksi SMTP OK, siap kirim email')
    } catch (err) {
        next(err)
    }
}

/**
 * POST /api/gaji-n3/kirim-slip
 * Kirim slip gaji (PDF) ke email satu karyawan (database hrd_entri).
 * Body: { nik, subject, message, filename, pdfBase64 }
 */
export const kirimSlipGajiN3 = async (req, res, next) => {
    try {
        const nik = String(req.body?.nik || '').trim()
        const hasil = await kirimSlipPdf({
            pool: poolEntri,
            nik,
            subject: String(req.body?.subject || '').trim(),
            message: String(req.body?.message || ''),
            filename: String(req.body?.filename || `${nik || 'slip'}.pdf`),
            pdfBase64: String(req.body?.pdfBase64 || ''),
            kolomNik: 'kar_Nik',
            namaPengirim: 'HRD Entri Jaya Makmur',
        })
        success(res, hasil, `Slip gaji terkirim ke ${hasil.email}`)
    } catch (err) {
        if (err.statusCode) return error(res, err.message, err.statusCode)
        next(err)
    }
}
