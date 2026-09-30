import pool from "./src/config/database.js"
import poolBsm from "./src/config/databaseBsm.js"
import { syncRekeningToTarget, normalizeRekening, REKENING_TARGET } from "./src/helpers/syncKaryawan.js"

//找一个 unit BSM 的员工，确保 194.33 有他
const [candidates] = await pool.query(`
  SELECT k.kar_nik, k.kar_nama, k.kar_kd_unit, k.kar_no_rekening
  FROM tkaryawan k WHERE k.kar_status_aktif = 1 AND k.kar_kd_unit IN ('1','2','3','4')
  LIMIT 20`)

let target = null
for (const c of candidates) {
  const [t] = await poolBsm.queryWithRetry('SELECT kar_Nik FROM tkaryawan WHERE kar_Nik = ?', [c.kar_nik])
  if (t.length > 0) { target = c; break }
}
if (!target) { console.log('tidak ada kandidat'); process.exit(1) }

const [tgtBefore] = await poolBsm.queryWithRetry(
  `SELECT ${REKENING_TARGET} FROM tkaryawan WHERE kar_Nik = ?`, [target.kar_nik])
console.log(`Target uji: ${target.kar_nik} | ${target.kar_nama} | unit ${target.kar_kd_unit}`)
console.log(`  194.33 ${REKENING_TARGET} SEBELUM : ${JSON.stringify(tgtBefore[0][REKENING_TARGET])}`)

// Skenario 1: rekening di VPS kosong -> harus SKIP, 194.33 tidak boleh berubah
let r = await syncRekeningToTarget({ kar_kd_unit: target.kar_kd_unit, kar_nik: target.kar_nik, kar_no_rekening: null })
console.log(`\n1) VPS kosong (null)      -> ${JSON.stringify(r)}`)
let [c1] = await poolBsm.queryWithRetry(`SELECT ${REKENING_TARGET} FROM tkaryawan WHERE kar_Nik = ?`, [target.kar_nik])
console.log(`   194.33 setelah         : ${JSON.stringify(c1[0][REKENING_TARGET])} | utuh: ${c1[0][REKENING_TARGET] === tgtBefore[0][REKENING_TARGET]}`)

r = await syncRekeningToTarget({ kar_kd_unit: target.kar_kd_unit, kar_nik: target.kar_nik, kar_no_rekening: '   ' })
console.log(`\n2) VPS spasi doang       -> ${JSON.stringify(r)}`)
let [c2] = await poolBsm.queryWithRetry(`SELECT ${REKENING_TARGET} FROM tkaryawan WHERE kar_Nik = ?`, [target.kar_nik])
console.log(`   194.33 setelah         : ${JSON.stringify(c2[0][REKENING_TARGET])} | utuh: ${c2[0][REKENING_TARGET] === tgtBefore[0][REKENING_TARGET]}`)

// Skenario 3: rekening terisi -> harus TERKIRIM
r = await syncRekeningToTarget({ kar_kd_unit: target.kar_kd_unit, kar_nik: target.kar_nik, kar_no_rekening: '9988776655' })
console.log(`\n3) VPS terisi            -> skipped=${r.skipped} target=${r.target} affected=${r.affectedRows} rek=${r.rekening}`)
let [c3] = await poolBsm.queryWithRetry(`SELECT ${REKENING_TARGET} FROM tkaryawan WHERE kar_Nik = ?`, [target.kar_nik])
console.log(`   194.33 setelah         : ${JSON.stringify(c3[0][REKENING_TARGET])} | tersimpan: ${c3[0][REKENING_TARGET] === '9988776655'}`)

// Skenario 4: unit tanpa target (RotiQ) -> skip
r = await syncRekeningToTarget({ kar_kd_unit: '19', kar_nik: '19072026002', kar_no_rekening: '111' })
console.log(`\n4) unit RotiQ (no target) -> ${JSON.stringify(r)}`)

// Skenario 5: varchar(30) kepanjangan -> dipotong, tidak error
console.log(`\n5) normalisasi:`)
console.log(`   '  123  '            -> ${JSON.stringify(normalizeRekening('  123  '))}`)
console.log(`   40 karakter         -> panjang ${normalizeRekening('x'.repeat(40)).length}`)
console.log(`   '' / null           -> ${JSON.stringify(normalizeRekening(''))} / ${JSON.stringify(normalizeRekening(null))}`)

// Skenario 6: 194.33 hanya varchar(30) -> pastikan tidak error
r = await syncRekeningToTarget({ kar_kd_unit: target.kar_kd_unit, kar_nik: target.kar_nik, kar_no_rekening: 'y'.repeat(40) })
console.log(`\n6) 40 char ke 194.33    -> affected=${r.affectedRows} (tidak error)`)

// RESTORE
await poolBsm.queryWithRetry(`UPDATE tkaryawan SET ${REKENING_TARGET} = ? WHERE kar_Nik = ?`,
  [tgtBefore[0][REKENING_TARGET], target.kar_nik])
const [back] = await poolBsm.queryWithRetry(`SELECT ${REKENING_TARGET} FROM tkaryawan WHERE kar_Nik = ?`, [target.kar_nik])
console.log(`\nRESTORE 194.33: ${JSON.stringify(back[0][REKENING_TARGET])} | sama dengan awal: ${back[0][REKENING_TARGET] === tgtBefore[0][REKENING_TARGET]}`)

process.exit(0)
