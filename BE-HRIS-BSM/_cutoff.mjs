import pool from "./src/config/database.js"
import poolBsm from "./src/config/databaseBsm.js"

const [b] = await poolBsm.queryWithRetry(`
  SELECT k.kar_Nik AS nik FROM tkaryawan k JOIN tpabrik p ON p.pab_kode = k.kar_pab_kode
  WHERE k.kar_status_aktif = 1 AND k.kar_sistem_gaji IN ('Harian','Bulanan')
    AND k.kar_GAPOK > 0 AND p.pab_nama LIKE 'PT Bumi Sarana Maju%'`)
const nikBsm = new Set(b.map((r) => String(r.nik).trim()))

// Data tersimpan 9/2026 di server BSM (dihitung oleh Delphi)
const [simpan] = await poolBsm.queryWithRetry(`
  SELECT g.gb_nik AS nik, g.gb_hariterlambat AS terlambat,
         g.gb_haritidakmasuk AS tidakmasuk, g.gb_potonganhari AS potonghari
  FROM tgajibulanan g
  JOIN tkaryawan k ON k.kar_Nik = g.gb_nik
  JOIN tpabrik p ON p.pab_kode = k.kar_pab_kode
  WHERE g.gb_periode = 9 AND g.gb_tahun = 2026 AND p.pab_nama LIKE 'PT Bumi Sarana Maju%'`)
const petaSimpan = new Map(simpan.map((r) => [String(r.nik).trim(), r]))

const cek = async (label, s, e) => {
  const [rows] = await pool.query("CALL rekap_absensiv3(?, ?, ?)", [s, e, "%"])
  const rekap = Array.isArray(rows?.[0]) ? rows[0] : Array.isArray(rows) ? rows : []
  let samaTL = 0, samaTM = 0, samaPH = 0, banding = 0
  for (const r of rekap) {
    const nik = String(r.Nik).trim()
    if (!nikBsm.has(nik)) continue
    const s2 = petaSimpan.get(nik)
    if (!s2) continue
    banding++
    const tl = Number(r.Terlambat) || 0
    const tm = (Number(r.CutiTahunan) || 0) + (Number(r.Sakit) || 0) + (Number(r.CutiKhusus) || 0)
    const ph = Number(r.Potong_Gaji) || 0
    if (tl === Number(s2.terlambat)) samaTL++
    if (tm === Number(s2.tidakmasuk)) samaTM++
    if (ph === Number(s2.potonghari)) samaPH++
  }
  console.log(
    `${label.padEnd(26)} banding=${String(banding).padStart(3)} | terlambat cocok ${samaTL} | tidakmasuk cocok ${samaTM} | potonghari cocok ${samaPH}`
  )
}

await cek("21 Agu - 20 Sep 2026", "2026-08-21", "2026-09-20")
await cek("21 Agu - 30 Sep 2026", "2026-08-21", "2026-09-30")
await cek("01 Sep - 30 Sep 2026", "2026-09-01", "2026-09-30")
await cek("21 Jul - 20 Sep 2026", "2026-07-21", "2026-09-20")
process.exit(0)
