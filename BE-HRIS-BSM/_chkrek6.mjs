import pool from "./src/config/database.js"
import poolBsm from "./src/config/databaseBsm.js"
import fetch from 'node-fetch'

const base = 'http://localhost:4002/api'
const login = await (await fetch(`${base}/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'pusat', password: '00000' })
})).json()
const headers = { Authorization: `Bearer ${login.data.token}`, 'Content-Type': 'application/json' }

const NIK = '01042017001'
const [tgt0] = await poolBsm.queryWithRetry('SELECT kar_rekeningbank FROM tkaryawan WHERE kar_Nik = ?', [NIK])
const asal = tgt0[0].kar_rekeningbank
console.log(`${NIK} | 194.33 sebelum: ${JSON.stringify(asal)}`)

// --- Kasus A: edit karyawan BSM dengan rekening KOSONG (payload form apa adanya) ---
const get1 = await (await fetch(`${base}/karyawan/${NIK}`, { headers })).json()
const d = get1.data
const bodyA = {
  kar_nik_ktp: d.kar_nik_ktp || null, kar_nama: d.kar_nama, kar_alamat: d.kar_alamat || null,
  kar_telp: d.kar_telp || null, kar_email: d.kar_email || null, kar_no_bpjs: d.kar_no_bpjs || null,
  kar_no_bpjstk: d.kar_no_bpjstk || null, kar_no_rekening: d.kar_no_rekening || null,
  kar_jnskelamin: d.kar_jnskelamin || null, kar_tempatlahir: d.kar_tempatlahir || null,
  kar_tgllahir: null, kar_tgl_masuk: d.kar_tgl_masuk ? String(d.kar_tgl_masuk).slice(0,10) : null,
  kar_kd_dept: d.kar_kd_dept || null, kar_kd_jabat: d.kar_kd_jabat || null, kar_kd_unit: d.kar_kd_unit,
  kar_status_karyawan: d.kar_status_karyawan, kar_sistem_gaji: d.kar_sistem_gaji || null,
  kar_status_aktif: Number(d.kar_status_aktif),
}
console.log(`\nA) simpan dengan rekening KOSONG (kar_no_rekening = ${JSON.stringify(bodyA.kar_no_rekening)})`)
await fetch(`${base}/karyawan/${NIK}`, { method: 'PUT', headers, body: JSON.stringify(bodyA) })
await new Promise(r => setTimeout(r, 1500))
const [tA] = await poolBsm.queryWithRetry('SELECT kar_rekeningbank FROM tkaryawan WHERE kar_Nik = ?', [NIK])
console.log(`   194.33 -> ${JSON.stringify(tA[0].kar_rekeningbank)} | TIDAK tertimpa NULL: ${tA[0].kar_rekeningbank === asal}`)

// --- Kasus B: isi rekening baru dari web ---
console.log(`\nB) simpan dengan rekening BARU = 8877665544`)
await fetch(`${base}/karyawan/${NIK}`, { method: 'PUT', headers, body: JSON.stringify({ ...bodyA, kar_no_rekening: '8877665544' }) })
await new Promise(r => setTimeout(r, 1500))
const [tB] = await poolBsm.queryWithRetry('SELECT kar_rekeningbank FROM tkaryawan WHERE kar_Nik = ?', [NIK])
console.log(`   194.33 -> ${JSON.stringify(tB[0].kar_rekeningbank)} | tersinkron: ${tB[0].kar_rekeningbank === '8877665544'}`)

// slip gaji BSM membaca kar_rekeningbank -> cek endpoint slip読取
const slip = await (await fetch(`${base}/gaji-bsm/karyawan`, { headers })).json()
const orang = (slip.data || []).find(x => x.nik === NIK)
console.log(`   Slip Gaji BSM membaca rekening = ${JSON.stringify(orang?.rekening)}`)

// --- RESTORE semua ---
await pool.query('UPDATE tkaryawan SET kar_no_rekening = NULL WHERE kar_nik = ?', [NIK])
await poolBsm.queryWithRetry('UPDATE tkaryawan SET kar_rekeningbank = ? WHERE kar_Nik = ?', [asal, NIK])
const [fin] = await poolBsm.queryWithRetry('SELECT kar_rekeningbank FROM tkaryawan WHERE kar_Nik = ?', [NIK])
const [finVps] = await pool.query('SELECT kar_no_rekening FROM tkaryawan WHERE kar_nik = ?', [NIK])
console.log(`\nRESTORE: 194.33=${JSON.stringify(fin[0].kar_rekeningbank)} (sama: ${fin[0].kar_rekeningbank === asal}) | VPS=${JSON.stringify(finVps[0].kar_no_rekening)}`)

process.exit(0)
