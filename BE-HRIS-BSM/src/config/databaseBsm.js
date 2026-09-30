import mysql from 'mysql2/promise'
import dotenv from 'dotenv'
dotenv.config()

// 🔥 Connection Pool database kedua: server BSM 192.168.194.33
// Dipakai modul "Proses Gaji BSM" (duplikasi ufrmProsesGaji Delphi).
const poolBsm = mysql.createPool({
    host: process.env.BSM_DB_HOST || '192.168.194.33',
    port: parseInt(process.env.BSM_DB_PORT) || 3306,
    user: process.env.BSM_DB_USER || 'root',
    password: process.env.BSM_DB_PASS || '',
    database: process.env.BSM_DB_NAME || 'hrd',
    waitForConnections: true,
    connectionLimit: 5,          // Kecil saja: operasi payroll sekuensial,
                                 // server BSM sensitif koneksi konkuren baru
    queueLimit: 0,               // Unlimited queue
    enableKeepAlive: true,       // Jaga koneksi tetap hidup
    keepAliveInitialDelay: 0,
    // MariaDB di 192.168.194.33 butuh ~10,3 detik sampai handshake selesai
    // (connect_timeout server = 10 detik, kemungkinan ada reverse-DNS lookup
    // yang timeout). Jadi client timeout WAJIB di atas 10 detik, kalau tidak
    // selalu kena ETIMEDOUT walaupun TCP connect sudah sukses.
    connectTimeout: 30000,
    multipleStatements: false,
})

/**
 * Jalankan query dengan retry kecil.
 * Server BSM kadang menolak/timeout koneksi baru sehingga modul
 * gagal saat query pertama; retry 3x dengan jeda pendek jauh lebih
 * stabil daripada test koneksi di startup (yang justru memicu
 * koneksi bersamaan dan memperburuk ETIMEDOUT).
 */
const delay = (ms) => new Promise((r) => setTimeout(r, ms))

async function withRetry(fn, retries = 3) {
    let lastErr
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await fn()
        } catch (err) {
            lastErr = err
            if (attempt < retries) {
                await delay(500 * (attempt + 1)) // 500ms, 1000ms, 1500ms
            }
        }
    }
    throw lastErr
}

/** Sama seperti pool.query tapi dengan retry */
poolBsm.queryWithRetry = (sql, params) =>
    withRetry(() => poolBsm.query(sql, params))

/** Sama seperti pool.execute tapi dengan retry */
poolBsm.executeWithRetry = (sql, params) =>
    withRetry(() => poolBsm.execute(sql, params))

/** Sama seperti pool.getConnection tapi dengan retry */
poolBsm.getConnectionWithRetry = () =>
    withRetry(() => poolBsm.getConnection())

export default poolBsm
