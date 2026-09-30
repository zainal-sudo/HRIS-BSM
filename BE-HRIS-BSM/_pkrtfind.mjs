import pool from "./src/config/database.js"
const [m] = await pool.query("SELECT MEN_ID, MEN_NAMA, MEN_NAMA2, men_icon, men_route, men_parent_id, men_order FROM tmenu WHERE men_route LIKE '%pkrt%'")
console.log("=== menu PKRT ==="); console.log(JSON.stringify(m, null, 1))
const [k] = await pool.query("SHOW COLUMNS FROM tkaryawan WHERE Field IN ('kar_tunjangan_kompetensi','kar_tunjangan_makan','kar_pph21','kar_bpjs_kesehatan','kar_bpjs_ketenagakerjaan','kar_simpanan_koperasi','kar_cicilan')")
console.log("\n=== kolom setting PKRT ==="); console.log(k.map(x=>`${x.Field} ${x.Type}`).join("\n"))
const [c] = await pool.query("SHOW COLUMNS FROM tgajibulananpkrt")
console.log("\n=== tgajibulananpkrt (" + c.length + " kolom) ==="); console.log(c.map(x=>x.Field).join(", "))
process.exit(0)
