/**
 * Smoke test endpoint Gaji PKRT.
 * Jalankan: node _smokepkrt.mjs
 * Menyalakan server di port 4102, lalu memanggil endpoint PKRT
 * dengan token JWT buatan (pakai JWT_SECRET yang sama).
 */
import jwt from "jsonwebtoken"
import dotenv from "dotenv"

dotenv.config()
process.env.PORT = "4102"

const PORT = 4102
const BASE = `http://127.0.0.1:${PORT}/api`
const token = jwt.sign(
    { user: "SMOKE", kd_unit: "%", kar_nik: "", nm_unit: "Pusat" },
    process.env.JWT_SECRET,
    { expiresIn: "5m" }
)
const H = { "Content-Type": "application/json", Authorization: `Bearer ${token}` }

await import("./app.js")
await new Promise((r) => setTimeout(r, 1200))

let gagal = 0
async function cek(nama, url, opts = {}, harusGagal = false) {
    try {
        const r = await fetch(BASE + url, { ...opts, headers: { ...H, ...(opts.headers || {}) } })
        const j = await r.json()
        const ok = harusGagal ? (r.status >= 400 && !j.success) : (r.status < 400 && j.success)
        if (!ok) gagal++
        const n = Array.isArray(j.data) ? j.data.length : (j.data?.jumlah ?? j.data?.rows?.length ?? "-")
        console.log(`${ok ? "OK  " : "FAIL"} ${r.status} ${url}  -> ${n} baris | ${j.message || j.error || ""}`)
        return j
    } catch (e) {
        gagal++
        console.log(`FAIL ERR ${url} -> ${e.message}`)
        return null
    }
}

console.log("--- endpoint Setting Gaji PKRT ---")
const unit = await cek("unit", "/setting-gaji-pkrt/unit")
const kodeUnit = unit?.data?.[0]?.kode
const set = await cek("setting", `/setting-gaji-pkrt${kodeUnit ? "?unit=" + kodeUnit : ""}`)
console.log("   contoh:", JSON.stringify(set?.data?.[0] ?? {}))

console.log("--- endpoint Proses Gaji PKRT ---")
const kar = await cek("karyawan", "/gaji-pkrt/karyawan")
console.log("   contoh:", JSON.stringify(kar?.data?.[0] ?? {}))
const cekAbsen = await cek("absensi", "/gaji-pkrt/absensi?start_date=2026-08-21&end_date=2026-09-20")
console.log("   contoh:", JSON.stringify(cekAbsen?.data?.rows?.[0] ?? {}))
const kosong = await cek("periode kosong", "/gaji-pkrt?periode=9&tahun=2026")

console.log("--- validasi (harus ditolak) ---")
await cek("periode salah", "/gaji-pkrt?periode=99&tahun=2026", {}, true)
await cek("tahun salah", "/gaji-pkrt?periode=9", {}, true)
await cek("tanpa rows", "/gaji-pkrt/simpan", { method: "POST", body: JSON.stringify({ periode: 9, tahun: 2026, rows: [] }) }, true)
await cek("tanpa rentang absensi", "/gaji-pkrt/absensi", {}, true)
await cek("setting tanpa rows", "/setting-gaji-pkrt", { method: "PUT", body: JSON.stringify({ rows: [] }) }, true)

console.log("--- round trip simpan -> baca -> bersihkan (periode uji 1/2099) ---")
const uji = (kar?.data ?? []).slice(0, 3).map((k, i) => ({
    nik: k.nik, nama: k.nama, jabatan: k.jabatan, unit: k.unit,
    gapok: 2000000, tjabatan: 250000, tkompetensi: 0, tmakan: 314313,
    poin: 3, hariinsentif: 2, haripotong: 1,
    pph21: 0, bpjskesehatan: 25700, bpjstk: 51400, simpankoperasi: 100000, cicilan: 0,
    _i: i,
}))
const simpan = await cek("simpan", "/gaji-pkrt/simpan", {
    method: "POST", body: JSON.stringify({ periode: 1, tahun: 2099, rows: uji }),
})
const baca = await cek("baca ulang", "/gaji-pkrt?periode=1&tahun=2099")
for (const b of baca?.data?.rows ?? []) {
    console.log(`   ${b.nik} ${b.nama}: THP=${b.thp} lembur=${b.lembur} insentif=${b.insentif} ` +
        `potGaji=${b.nominalpotgaji} potongan=${b.potongan} gaji=${b.gaji} bulat=${b.gajibulat}`)
}
if ((baca?.data?.jumlah ?? 0) !== uji.length) {
    gagal++
    console.log("FAIL jumlah baris tidak sama")
} else {
    console.log("OK   jumlah baris tersimpan = terkirim")
}

console.log("--- bersihkan data uji ---")
const { default: pool } = await import("./src/config/database.js")
const [hapus] = await pool.query("DELETE FROM tgajibulananpkrt WHERE gb_periode = 1 AND gb_tahun = 2099")
console.log(`OK   ${hapus.affectedRows} baris uji dihapus dari tgajibulananpkrt`)
await cek("periode uji sudah bersih", "/gaji-pkrt?periode=1&tahun=2099")

console.log("--- menu ---")
const menu = await cek("menu", "/menu/user/pusat")
const routes = (menu?.data ?? []).flatMap((g) => (g.items ?? []).map((i) => i.to))
console.log("   route PKRT di sidebar:", routes.filter((r) => String(r).includes("pkrt")))

console.log(gagal === 0 ? "\nSMOKE TEST LULUS" : `\n${gagal} ENDPOINT GAGAL`)
process.exit(gagal === 0 ? 0 : 1)
