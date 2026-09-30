import pool from "./src/config/database.js"
import poolBsm from "./src/config/databaseBsm.js"
import poolEntri from "./src/config/databaseEntri.js"

const BSM_UNITS = ['1','2','3','4','5','10','11','12','13','14','17','18']
const ENTRI_UNITS = ['6','20','21','26']

const target = (u) => BSM_UNITS.includes(String(u)) ? 'hrd' : ENTRI_UNITS.includes(String(u)) ? 'hrd_entri' : null

// How many employees live on the VPS for units that DO get synced?
const [vpsBsm] = await pool.query(`
  SELECT k.kar_kd_unit, COUNT(*) c
  FROM tkaryawan k WHERE k.kar_status_aktif = 1
    AND k.kar_kd_unit IN (${BSM_UNITS.map(() => '?').join(',')}) GROUP BY k.kar_kd_unit`, BSM_UNITS)
console.log('VPS karyawan aktif per unit BSM:')
for (const r of vpsBsm) console.log(`  unit ${r.kar_kd_unit}: ${r.c}`)

const [vpsEntri] = await pool.query(`
  SELECT k.kar_kd_unit, COUNT(*) c FROM tkaryawan k
  WHERE k.kar_status_aktif = 1 AND k.kar_kd_unit IN (${ENTRI_UNITS.map(() => '?').join(',')})
  GROUP BY k.kar_kd_unit`, ENTRI_UNITS)
console.log('\nVPS karyawan aktif per unit Entri:')
for (const r of vpsEntri) console.log(`  unit ${r.kar_kd_unit}: ${r.c}`)

// Compare rekening per NIK: VPS vs 194.33, for synced units only
const [vpsRows] = await pool.query(`
  SELECT kar_nik, kar_nama, kar_kd_unit, kar_no_rekening, kar_status_aktif
  FROM tkaryawan
  WHERE kar_kd_unit IN (${[...BSM_UNITS, ...ENTRI_UNITS].map(() => '?').join(',')})`, [...BSM_UNITS, ...ENTRI_UNITS])

const cekSisi = async (label, p) => {
  const grup = label === 'hrd' ? BSM_UNITS : ENTRI_UNITS
  const rows = vpsRows.filter(r => grup.includes(String(r.kar_kd_unit)))
  if (rows.length === 0) return { label, total: 0 }
  const niks = rows.map(r => r.kar_nik)
  const [tgt] = await p.queryWithRetry(
    `SELECT kar_Nik, kar_rekeningbank FROM tkaryawan WHERE kar_Nik IN (${niks.map(() => '?').join(',')})`, niks)
  const peta = new Map(tgt.map(r => [String(r.kar_Nik), r.kar_rekeningbank]))

  let vpsIsi = 0, tgtIsi = 0, sama = 0, bedaVpsKosong = 0, bedaTgtKosong = 0, beda = 0
  const contohBeda = []
  for (const r of rows) {
    const v = r.kar_no_rekening ? String(r.kar_no_rekening).trim() : ''
    const t = peta.get(String(r.kar_nik))
    const ts = t ? String(t).trim() : ''
    if (v) vpsIsi++
    if (ts) tgtIsi++
    if (v && ts && v === ts) sama++
    else if (!v && ts) bedaVpsKosong++
    else if (v && !ts) bedaTgtKosong++
    else if (v && ts) { beda++; if (contohBeda.length < 8) contohBeda.push({ ...r, t }) }
  }
  console.log(`\n${label}: ${rows.length} karyawan VPS di unit yang di-sync`)
  console.log(`  ada di 194.33            : ${peta.size}`)
  console.log(`  VPS kar_no_rekening isi  : ${vpsIsi}`)
  console.log(`  194.33 kar_rekeningbank  : ${tgtIsi}`)
  console.log(`  SAMA                     : ${sama}`)
  console.log(` beda: VPS kosong, 194.33 isi : ${bedaVpsKosong}  <- hati-hati, ini akan tertimpa NULL`)
  console.log(`  beda: VPS isi, 194.33 kosong : ${bedaTgtKosong}  <- aman, ini targetnya`)
  console.log(`  beda: dua-duanya beda     : ${beda}`)
  for (const c of contohBeda) console.log(`    ${c.kar_nik} | ${c.kar_nama} | VPS=${c.kar_no_rekening} | 194.33=${c.t}`)
  return { label, bedaVpsKosong, bedaTgtKosong, beda }
}

await cekSisi('hrd', poolBsm)
await cekSisi('hrd_entri', poolEntri)

// Does 194.33 even have a row for these NIKs at all?
console.log('\n--- apakah kolom kar_rekeningbank ada di 194.33? ---')
for (const [label, p] of [['hrd', poolBsm], ['hrd_entri', poolEntri]]) {
  const [c] = await p.queryWithRetry("SHOW COLUMNS FROM tkaryawan LIKE 'kar_rekeningbank'")
  console.log(`${label}: ${c.length ? `ada, tipe ${c[0].Type}, default ${c[0].Default}` : 'TIDAK ADA'}`)
}

process.exit(0)
