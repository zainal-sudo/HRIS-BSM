import mysql from 'mysql2/promise'
import dotenv from 'dotenv'
dotenv.config()

// 🔥 Connection Pool (sehat, tidak numpuk)
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'bsm_hris',
    waitForConnections: true,
    connectionLimit: 10,         // Max 10 koneksi concurrent
    queueLimit: 0,               // Unlimited queue
    enableKeepAlive: true,       // Jaga koneksi tetap hidup
    keepAliveInitialDelay: 0,
    connectTimeout: 10000,       // Timeout 10 detik
})

// 🔥 Test koneksi saat startup
pool.getConnection()
    .then(conn => {
        console.log('✅ Database connected successfully')
        conn.release()
    })
    .catch(err => {
        console.error('❌ Database connection failed:', err.message)
    })

export default pool