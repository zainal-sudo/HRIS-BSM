/**
 * Runner SQL ONE-OFF: apply file sql/<nama>.sql ke database utama (config/database.js).
 * Pakai: node _runsql.mjs sql/nama-file.sql
 * Aman dipanggil ulang karena file SQL-nya ditulis idempotent.
 */
import fs from "node:fs"
import path from "node:path"
import mysql from "mysql2/promise"
import dotenv from "dotenv"

dotenv.config()

const file = process.argv[2]
if (!file) {
    console.error("Pakai: node _runsql.mjs sql/nama-file.sql")
    process.exit(1)
}

const sql = fs.readFileSync(path.resolve(file), "utf8")

const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASS ?? "",
    database: process.env.DB_NAME || "hrd",
    multipleStatements: true,
    connectTimeout: 15000,
})

try {
    const hasil = await conn.query(sql)
    console.log("OK", file)
    for (const [i, r] of hasil.entries()) {
        if (Array.isArray(r) && r.length) console.log(`  stmt#${i + 1} -> ${r.length} baris`)
    }
} catch (err) {
    console.error("GAGAL:", err.message)
    process.exitCode = 1
} finally {
    await conn.end()
}
