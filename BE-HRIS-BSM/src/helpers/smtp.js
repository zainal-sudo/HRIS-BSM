import nodemailer from 'nodemailer'

/**
 * Helper SMTP bersama (dipakai gaji-roti & gaji-bsm).
 * Pola sama seperti d:\web email\backend.
 *
 * Koneksi dipakai ulang (pool) supaya tidak buka-tutup koneksi per email
 * yang rawan di-reset Gmail (read ECONNRESET).
 */
let transporterCache = null

export function smtpTransporter() {
    const host = process.env.SMTP_HOST
    const user = process.env.SMTP_USER
    const pass = process.env.SMTP_PASS
    if (!host || !user || !pass) return null
    if (!transporterCache) {
        const port = Number(process.env.SMTP_PORT) || 587
        transporterCache = nodemailer.createTransport({
            host,
            port,
            secure: port === 465,
            auth: { user, pass },
            pool: true,
            maxConnections: 2,
            maxMessages: 50,
            rateLimit: 2,
            connectionTimeout: 20000,
            greetingTimeout: 15000,
            socketTimeout: 30000,
        })
    }
    return transporterCache
}

/**
 * Kirim satu PDF slip ke email karyawan.
 * @param {object} opt
 * @param {Pool} opt.pool - pool mysql (database.js / databaseBsm.js)
 * @param {string} opt.nik
 * @param {string} opt.subject
 * @param {string} opt.message
 * @param {string} opt.filename
 * @param {string} opt.pdfBase64
 * @param {string} opt.kolomNik - nama kolom NIK di tkaryawan ('kar_nik' / 'kar_Nik')
 * @param {string} opt.namaPengirim - nama tampil pengirim (default 'HRD BSM')
 * @returns {Promise<{nik,nama,email,file}>}
 * @throws {Error} dengan properti statusCode (400/404/500/502)
 */
export async function kirimSlipPdf({ pool, nik, subject, message, filename, pdfBase64, kolomNik = 'kar_nik', namaPengirim = 'HRD BSM' }) {
    const gagal = (msg, code = 500) => {
        const e = new Error(msg)
        e.statusCode = code
        throw e
    }

    if (!nik) gagal('NIK wajib diisi', 400)
    if (!subject) gagal('Subjek email wajib diisi', 400)
    if (!pdfBase64) gagal('File PDF belum ada', 400)

    const transporter = smtpTransporter()
    if (!transporter) {
        gagal('Konfigurasi SMTP belum diisi di server (SMTP_HOST/SMTP_USER/SMTP_PASS)', 500)
    }

    const runQuery = typeof pool.queryWithRetry === 'function'
        ? pool.queryWithRetry.bind(pool)
        : pool.query.bind(pool)

    const [rows] = await runQuery(
        `SELECT kar_nama, kar_email FROM tkaryawan WHERE ${kolomNik} = ?`,
        [nik]
    )
    if (rows.length === 0) gagal(`Karyawan ${nik} tidak ditemukan`, 404)
    const emailTujuan = String(rows[0].kar_email || '').trim()
    if (!emailTujuan || emailTujuan === '-') {
        gagal(`Karyawan ${nik} (${rows[0].kar_nama}) belum punya alamat email`, 404)
    }

    const buffer = Buffer.from(pdfBase64, 'base64')
    if (buffer.subarray(0, 4).toString() !== '%PDF' || buffer.length > 8 * 1024 * 1024) {
        gagal('Isi PDF tidak valid', 400)
    }

    // Coba kirim 2x: percobaan pertama yang kena ECONNRESET/timeout
    // biasanya berhasil di percobaan kedua (koneksi pool sudah hangat)
    let errTerakhir = null
    for (let percobaan = 1; percobaan <= 2; percobaan++) {
        try {
            await transporter.sendMail({
                from: `"${namaPengirim}" <${process.env.SMTP_USER}>`,
                to: emailTujuan,
                subject,
                text: `Halo ${rows[0].kar_nama},\n\n${message}`,
                attachments: [{ filename, content: buffer, contentType: 'application/pdf' }],
            })
            errTerakhir = null
            break
        } catch (e) {
            errTerakhir = e
            await new Promise((r) => setTimeout(r, 2000))
        }
    }
    if (errTerakhir) {
        gagal(`Gagal kirim ke ${emailTujuan}: ${errTerakhir.message || errTerakhir}`, 502)
    }

    return { nik, nama: rows[0].kar_nama, email: emailTujuan, file: filename }
}
