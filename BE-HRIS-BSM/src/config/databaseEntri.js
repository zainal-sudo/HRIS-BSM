import mysql from 'mysql2/promise'
import dotenv from 'dotenv'
dotenv.config()

// 🔥 Connection Pool database ketiga: server 192.168.194.33 database hrd_entri
// (PT Entri Jaya Makmur). Kredensial default mengikuti BSM_DB_* agar tidak
// perlu konfigurasi tambahan; override via ENTRI_DB_* bila berbeda.
const poolEntri = mysql.createPool({
    host: process.env.ENTRI_DB_HOST || process.env.BSM_DB_HOST || '192.168.194.33',
    port: parseInt(process.env.ENTRI_DB_PORT || process.env.BSM_DB_PORT) || 3306,
    user: process.env.ENTRI_DB_USER || process.env.BSM_DB_USER || 'root',
    password: process.env.ENTRI_DB_PASS ?? process.env.BSM_DB_PASS ?? '',
    database: process.env.ENTRI_DB_NAME || 'hrd_entri',
    waitForConnections: true,
    connectionLimit: 5,          // Kecil saja: server 194.33 sensitif koneksi konkuren baru
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    // Sama seperti databaseBsm.js: handshake ke 194.33 bisa >10 detik
    // (reverse-DNS lookup), jadi timeout harus di atas itu.
    connectTimeout: 30000,
    multipleStatements: false,
})

const delay = (ms) => new Promise((r) => setTimeout(r, ms))

async function withRetry(fn, retries = 3) {
    let lastErr
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await fn()
        } catch (err) {
            lastErr = err
            if (attempt < retries) {
                await delay(500 * (attempt + 1))
            }
        }
    }
    throw lastErr
}

/** Sama seperti pool.query tapi dengan retry */
poolEntri.queryWithRetry = (sql, params) =>
    withRetry(() => poolEntri.query(sql, params))

/** Sama seperti pool.execute tapi dengan retry */
poolEntri.executeWithRetry = (sql, params) =>
    withRetry(() => poolEntri.execute(sql, params))

/** Sama seperti pool.getConnection tapi dengan retry */
poolEntri.getConnectionWithRetry = () =>
    withRetry(() => poolEntri.getConnection())

export default poolEntri
