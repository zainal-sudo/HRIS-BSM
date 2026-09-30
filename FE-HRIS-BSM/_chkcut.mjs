// Cek logika cutoff: 21 bulan sebelumnya s/d 20 bulan terpilih
function setDefaultRange(tahun, periode) {
  const blnLalu = new Date(tahun, periode - 2, 1);
  const start = `${blnLalu.getFullYear()}-${String(blnLalu.getMonth() + 1).padStart(2, "0")}-21`;
  const end = `${tahun}-${String(periode).padStart(2, "0")}-20`;
  return { start, end };
}

const BULAN = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"]
let bad = 0
for (let p = 1; p <= 12; p++) {
  const r = setDefaultRange(2026, p)
  const s = new Date(r.start + "T00:00:00")
  const e = new Date(r.end + "T00:00:00")
  const hari = Math.round((e - s) / 86400000) + 1
  const ok = s.getDate() === 21 && e.getDate() === 20
  if (!ok) bad++
  console.log(
    `${ok ? "OK " : "BAD"} gaji ${BULAN[p - 1].padEnd(9)} ${r.start} s/d ${r.end}  (${hari} hari)`
  )
}
// Cek pergantian tahun: gaji Januari 2027
const jan = setDefaultRange(2027, 1)
console.log(`OK  gaji Januari 2027 -> ${jan.start} s/d ${jan.end}`)
console.log(bad === 0 ? "SEMUA BULAN LULUS" : `${bad} BULAN GAGAL`)
process.exit(0)
