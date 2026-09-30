import pool from '../config/database.js'
import { success, error } from '../helpers/response.js'
import { smtpTransporter, kirimSlipPdf } from '../helpers/smtp.js'

/**
 * PROSES GAJI ROTI
 * Porting dari form Delphi ufrmProsesGajiRoti (D:\program\hrd bsm).
 *
 * Alur aslinya:
 *   1. InsertNilai  -> daftar karyawan aktif unit roti + gapok, gaji/hari,
 *                      uphold lembur (gapok/208*1.5), rekening
 *   2. Button3Click -> CALL rekap_absensiv2(tgl1, tgl2, cabang) lalu isi
 *                      masuk, potong gaji, jam lembur; hitung lembur & total
 *   3. InsertNilai2 -> muat data yang sudah tersimpan di tgajibulananroti
 *   4. Simpan       -> hapus periode tsb lalu insert ulang (dalam 1 transaksi)
 *
 * Catatan perbedaan dengan Delphi:
 *   - Unit payroll mengikuti nm_unit LIKE 'RotiQ%' (di Delphi ditulis manual
 *     19, 22, 23, 24; sekarang ada unit RotiQ baru yang otomatis ikut).
 *   - Kolom gb_rekening tidak ada di tabel tgajibulananroti, jadi rekening
 *     diambil dari tkaryawan saat proses, tidak disimpan.
 */

// Upah lembur per jam: gaji pokok / 208 jam x 1.5 (sama dengan Delphi)
const SQL_LEMBUR_PER_JAM = '(k.kar_gaji_pokok / 208 * 1.5)'

// Jaringan LEADER dibayar gaji pokok, bukan harian + lembur
const CEK_LEADER = (jabatan) => String(jabatan || '').toUpperCase().includes('LEADER')

/** Ubah apa pun jadi angka, nilai kosong/rusak -> 0 */
const num = (v) => {
    const n = Number(v)
    return isNaN(n) ? 0 : n
}

/**
 * 'HH:MM:SS' -> jam desimal.
 * Setara fungsi TimeToHours() di bantu\Ulib.pas (h + m/60 + s/3600).
 */
function timeToHours(value) {
    const parts = String(value || '').split(':')
    if (parts.length === 0 || String(value || '').trim() === '') return 0
    const h = num(parts[0])
    const m = num(parts[1])
    const s = num(parts[2])
    return h + m / 60 + s / 3600
}

/** Hitung total bayar satu baris (aturan sama dengan InsertNilai2 Delphi) */
function hitungTotal({ jabatan, gapok, lembur, gajiperhari, masuk, punishment }) {
    if (CEK_LEADER(jabatan)) return num(gapok)
    return num(lembur) + num(gajiperhari) * num(masuk) - num(punishment)
}

/**
 * GET /api/gaji-roti/karyawan
 * Daftar karyawan aktif unit RotiQ -> dasar grid proses gaji.
 */
export const getKaryawanRoti = async (req, res, next) => {
    try {
        const [rows] = await pool.query(
            `SELECT
        k.kar_nik AS nik,
        k.kar_nama AS nama,
        j.nm_jabat AS jabatan,
        u.nm_unit AS unit,
        COALESCE(k.kar_gaji_pokok, 0) AS gapok,
        COALESCE(k.kar_gaji_per_hari, 0) AS gajiperhari,
        COALESCE(${SQL_LEMBUR_PER_JAM}, 0) AS lemburperjam,
        COALESCE(k.kar_no_rekening, '') AS rekening,
        COALESCE(k.kar_email, '') AS email
      FROM tkaryawan k
      LEFT JOIN tjabatan j ON j.kd_jabat = k.kar_kd_jabat
      LEFT JOIN tunit u ON u.kd_unit = k.kar_kd_unit
      WHERE k.kar_status_aktif = 1
        AND u.nm_unit LIKE 'RotiQ%'
      ORDER BY k.kar_nik`
        )

        success(res, rows, `${rows.length} karyawan aktif unit RotiQ dimuat`)

    } catch (err) {
        next(err)
    }
}

/**
 * GET /api/gaji-roti/absensi?start_date=&end_date=&cabang=
 * Rekap absensi dari stored procedure rekap_absensiv2, disaring hanya
 * karyawan unit RotiQ (prosedurnya sendiri tidak memfilter cabang).
 */
export const getAbsensiRoti = async (req, res, next) => {
    try {
        const startDate = req.query.start_date
        const endDate = req.query.end_date

        if (!startDate || !endDate) {
            return error(res, 'Rentang tanggal absensi wajib diisi', 400)
        }
        if (startDate > endDate) {
            return error(res, 'Tanggal awal tidak boleh melewati tanggal akhir', 400)
        }

        // Branch & hanya dipakai sebagai parameter prosedur (sdefault 19 = RotiQ)
        const cabang = String(req.query.cabang || '19')

        // NIK yang boleh masuk proses gaji roti
        const [nikRows] = await pool.query(
            `SELECT k.kar_nik AS nik
       FROM tkaryawan k
       JOIN tunit u ON u.kd_unit = k.kar_kd_unit
       WHERE u.nm_unit LIKE 'RotiQ%'`
        )
        const nikRoti = new Set(nikRows.map((r) => String(r.nik).trim()))

        // CALL pada mysql2 terbungkus satu level lebih dalam:
        // hasil = [ [ {baris...}, {okPacket} ] ]
        const [result] = await pool.query('CALL rekap_absensiv2(?, ?, ?)', [startDate, endDate, cabang])
        const allRows = (Array.isArray(result?.[0]) ? result[0] : (Array.isArray(result) ? result : []))
            .filter((r) => r && nikRoti.has(String(r.Nik).trim()))

        const data = allRows.map((r) => ({
            nik: r.Nik,
            nama: r.Nama,
            jabatan: r.Jabatan,
            unit: r.Cabang,
            hari: num(r.Hari),
            masuk: num(r.Masuk),
            terlambat: num(r.Terlambat),
            potonggaji: num(r.Potong_Gaji),
            jamlembur: timeToHours(r.TotalJamLembur),
            keterangan: r.Keterangan || '',
        }))

        success(res, data, `Absensi ${data.length} karyawan RotiQ dalam periode ${startDate} s/d ${endDate}`)

    } catch (err) {
        next(err)
    }
}

/**
 * GET /api/gaji-roti?periode=&tahun=
 * Data gaji roti yang sudah tersimpan pada satu periode.
 */
export const getGajiRoti = async (req, res, next) => {
    try {
        const periode = parseInt(req.query.periode)
        const tahun = parseInt(req.query.tahun)

        if (!periode || periode < 1 || periode > 12) {
            return error(res, 'Periode (bulan) tidak valid', 400)
        }
        if (!tahun || tahun < 2000 || tahun > 2100) {
            return error(res, 'Tahun tidak valid', 400)
        }

        const [rows] = await pool.query(
            `SELECT
        g.gb_nik AS nik,
        g.gb_nama AS nama,
        COALESCE(g.gb_jabatan, j.nm_jabat, '') AS jabatan,
        COALESCE(u.nm_unit, '') AS unit,
        COALESCE(g.gb_hari, 0) AS hari,
        COALESCE(g.gb_masuk, 0) AS masuk,
        COALESCE(g.gb_potonggaji, 0) AS potonggaji,
        COALESCE(g.gb_jamlembur, 0) AS jamlembur,
        COALESCE(g.gb_gajiperhari, 0) AS gajiperhari,
        COALESCE(g.gb_gapok, 0) AS gapok,
        COALESCE(g.gb_lemburperjam, 0) AS lemburperjam,
        COALESCE(g.gb_lembur, 0) AS lembur,
        COALESCE(g.gb_punishment, 0) AS punishment,
        COALESCE(k.kar_no_rekening, '') AS rekening,
        COALESCE(k.kar_email, '') AS email
      FROM tgajibulananroti g
      LEFT JOIN tkaryawan k ON k.kar_nik = g.gb_nik
      LEFT JOIN tjabatan j ON j.kd_jabat = k.kar_kd_jabat
      LEFT JOIN tunit u ON u.kd_unit = k.kar_kd_unit
      WHERE g.gb_periode = ? AND g.gb_tahun = ?
      ORDER BY g.gb_nik`,
            [periode, tahun]
        )

        const data = rows.map((r) => ({ ...r, total: hitungTotal(r) }))

        success(res, {
            periode,
            tahun,
            rows: data,
            jumlah: data.length,
        }, data.length > 0
            ? `${data.length} data gaji tersimpan untuk periode ${periode}/${tahun}`
            : `Belum ada data gaji untuk periode ${periode}/${tahun}`)

    } catch (err) {
        next(err)
    }
}

/**
 * POST /api/gaji-roti/simpan
 * Simpan hasil proses: hapus dulu periode tsb, lalu insert ulang
 * (persis seperti simpandata di Delphi) dalam satu transaksi.
 */
export const simpanGajiRoti = async (req, res, next) => {
    const conn = await pool.getConnection()

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

        // Cegah NIK ganda dalam satu payload (kolomnya primary key)
        const nikUnique = new Set()
        for (const r of isi) {
            const nik = String(r.nik).trim()
            if (nikUnique.has(nik)) {
                return error(res, `NIK ${nik} muncul lebih dari sekali`, 400)
            }
            nikUnique.add(nik)
        }

        await conn.beginTransaction()

        await conn.query('DELETE FROM tgajibulananroti WHERE gb_periode = ? AND gb_tahun = ?', [periode, tahun])

        // Nilai uang dihitung ulang di server supaya tidak bergantung grid frontend
        const values = isi.map((r) => {
            const gapok = num(r.gapok)
            const gajiperhari = num(r.gajiperhari)
            const lemburperjam = num(r.lemburperjam)
            const jamlembur = num(r.jamlembur)
            const masuk = num(r.masuk)
            const potonggaji = num(r.potonggaji)
            const punishment = num(r.punishment)
            const lembur = jamlembur * lemburperjam
            return [
                periode,
                tahun,
                String(r.nik).trim(),
                String(r.nama || ''),
                String(r.jabatan || ''),
                masuk + potonggaji, // gb_hari = masuk + potong gaji (men ikut Delphi)
                masuk,
                potonggaji,
                jamlembur,
                gajiperhari,
                gapok,
                lemburperjam,
                lembur,
                punishment,
            ]
        })

        const CHUNK = 200
        for (let i = 0; i < values.length; i += CHUNK) {
            const slice = values.slice(i, i + CHUNK)
            const placeholders = slice.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ')
            await conn.query(
                `INSERT INTO tgajibulananroti
          (gb_periode, gb_tahun, gb_nik, gb_nama, gb_jabatan,
           gb_hari, gb_masuk, gb_potonggaji, gb_jamlembur, gb_gajiperhari,
           gb_gapok, gb_lemburperjam, gb_lembur, gb_punishment)
        VALUES ${placeholders}`,
                slice.flat()
            )
        }

        await conn.commit()

        success(res, { periode, tahun, jumlah: isi.length },
            `Gaji Roti periode ${periode}/${tahun} berhasil disimpan (${isi.length} karyawan)`)

    } catch (err) {
        await conn.rollback()
        next(err)
    } finally {
        conn.release()
    }
}

/**
 * GET /api/gaji-roti/smtp-test
 * Cek konfigurasi & koneksi SMTP tanpa mengirim email.
 */
export const tesSmtp = async (req, res, next) => {
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
 * POST /api/gaji-roti/kirim-slip
 * Kirim slip gaji (PDF) ke email satu karyawan.
 * Body: { nik, subject, message, filename, pdfBase64 }
 */
export const kirimSlipGaji = async (req, res, next) => {
    try {
        const nik = String(req.body?.nik || '').trim()
        const hasil = await kirimSlipPdf({
            pool,
            nik,
            subject: String(req.body?.subject || '').trim(),
            message: String(req.body?.message || ''),
            filename: String(req.body?.filename || `${nik || 'slip'}.pdf`),
            pdfBase64: String(req.body?.pdfBase64 || ''),
        })
        success(res, hasil, `Slip gaji terkirim ke ${hasil.email}`)
    } catch (err) {
        if (err.statusCode) return error(res, err.message, err.statusCode)
        next(err)
    }
}
