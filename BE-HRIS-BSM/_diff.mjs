import pool from "./src/config/database.js"
import poolBsm from "./src/config/databaseBsm.js"

const [b] = await poolBsm.queryWithRetry(`
  SELECT k.kar_Nik AS nik FROM tkaryawan k JOIN tpabrik p ON p.pab_kode = k.kar_pab_kode
  WHERE k.kar_status_aktif = 1 AND k.kar_sistem_gaji IN ('Harian','Bulanan')
    AND k.kar_GAPOK > 0 AND p.pab_nama LIKE 'PT Bumi Sarana Maju%'`)
const nikBsm = new Set(b.map((r) => String(r.nik).trim()))

const [simpan] = await poolBsm.queryWithRetry(`
  SELECT g.gb_nik AS nik, g.gb_hariterlambat AS terlambat, g.gb_haritidakmasuk AS tidakmasuk,
         g.gb_potonganhari AS potonghari, g.gb_nama AS nama
  FROM tgajibulanan g
  JOIN tkaryawan k ON k.kar_Nik = g.gb_nik
  JOIN tpabrik p ON p.pab_kode = k.kar_pab_kode
  WHERE g.gb_periode = 9 AND g.gb_tahun = 2026 AND p.pab_nama LIKE 'PT Bumi Sarana Maju%'`)
const peta = new Map(simpan.map((r) => [String(r.nik).trim(), r]))

const [rows] = await pool.query("CALL rekap_absensiv3(?, ?, ?)", ["2026-08-21", "2026-09-20", "%"])
const rekap = Array.isArray(rows?.[0]) ? rows[0] : Array.isArray(rows) ? rows : []

console.log("Selisih terhadap data tersimpan (cutoff 21/08-20/09/2026):\n")
for (const r of rekap) {
  const nik = String(r.Nik).trim()
  if (!nikBsm.has(nik)) continue
  const s = peta.get(nik)
  if (!s) continue
  const tl = Number(r.Terlambat) || 0
  const tm = (Number(r.CutiTahunan) || 0) + (Number(r.Sakit) || 0) + (Number(r.CutiKhusus) || 0)
  const ph = Number(r.Potong_Gaji) || 0
  if (tl !== Number(s.terlambat) || tm !== Number(s.tidakmasuk) || ph !== Number(s.potonghari)) {
    console.log(`${nik} ${s.nama}`)
    console.log(`   rekap : terlambat=${tl} tidakmasuk=${tm} potonghari=${ph}`)
    console.log(`   simpan: terlambat=${s.terlambat} tidakmasuk=${s.tidakmasuk} potonghari=${s.potonghari}`)
  }
}
console.log("\nSelesai.")
process.exit(0)
