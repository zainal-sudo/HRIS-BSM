import poolBsm from '../config/databaseBsm.js'
import poolUtama from '../config/database.js'
import { success, error } from '../helpers/response.js'
import { kirimSlipPdf, smtpTransporter } from '../helpers/smtp.js'

/** Unit payroll BSM hanya PT Bumi Sarana Maju (buang BSM Olshop, Rotiq, dll) */
const FILTER_UNIT_BSM = "p.pab_nama LIKE 'PT Bumi Sarana Maju%'"

/**
 * PROSES GAJI BSM
 * Duplikasi form Delphi ufrmProsesGaji (D:\program\hrd bsm) dengan
 * database di server kedua (192.168.194.33).
 *
 * Alur aslinya:
 *   1. InsertNilai  -> karyawan aktif (sistem Harian/Bulanan, gapok > 0)
 *                      + tunjangan dari tkaryawan, join tjabatan & tpabrik
 *   2. Button3Click -> CALL rekap_absensiv2(...) isi terlambat/tidakmasuk/
 *                      potonganhari  [** diambil dari server UTAMA lewat
 *                      rekap_absensiv3, karena server BSM tidak punya
 *                      routine & datanya mentok 2021 **]
 *   3. Button4Click -> angsuran dari zkaryawanall [** tidak ada; tabel
 *                      tpinjaman/tcicilan mentok 2021; diedit manual **]
 *   4. InsertNilai2 -> muat data tersimpan dari tgajibulanan
 *   5. Simpan       -> hapus periode tsb lalu insert ulang (1 transaksi)
 *
 * Rumus total (persis Delphi):
 *   dasar    = gapok + (tunj_jabatan - potong_jabatan)
 *              + tunjangan_kompetensi + tunjangan_absensi
 *   potongan = bpjs + bpjstk + koperasi + angsuran
 *              + (terlambat x 5000)
 *              + (potong_hari x (gapok + (tunj_jab - pot_jab) + tunj_absensi) / 25)
 *              + (tidak_masuk x tunjangan_absensi / 25)
 *              + pph21
 *   total    = dasar - potongan
 */

/** Ubah apa pun jadi angka, nilai kosong/rusak -> 0 */
const num = (v) => {
    const n = Number(v)
    return isNaN(n) ? 0 : n
}

/** Hitung rincian potongan + total satu baris (aturan Delphi) */
export function hitungGajiBsm(r) {
    const gapok = num(r.gapok)
    const tkompetensi = num(r.tkompetensi)
    const tjabatan = num(r.tjabatan)
    const potjabatan = num(r.potjabatan)
    const tabsensi = num(r.tabsensi)
    const bpjstk = num(r.bpjstk)
    const bpjs = num(r.bpjs)
    const koperasi = num(r.koperasi)
    const tidakmasuk = num(r.tidakmasuk)
    const terlambat = num(r.terlambat)
    const potonghari = num(r.potonghari)
    const angsuran = num(r.angsuran)
    const pph21 = num(r.pph21)

    const dasar = gapok + (tjabatan - potjabatan) + tkompetensi + tabsensi
    const potTerlambat = terlambat * 5000
    const potHarikerja = potonghari * (gapok + (tjabatan - potjabatan) + tabsensi) / 25
    const potTidakmasuk = tidakmasuk * tabsensi / 25
    const potongan = bpjs + bpjstk + koperasi + angsuran
        + potTerlambat + potHarikerja + potTidakmasuk + pph21
    const total = dasar - potongan

    return { dasar, potTerlambat, potHarikerja, potTidakmasuk, potongan, total }
}

/**
 * GET /api/gaji-bsm/karyawan
 * Master karyawan aktif (sistem Harian/Bulanan, gapok > 0) -> dasar grid.
 * Setara InsertNilai di Delphi.
 */
export const getKaryawanBsm = async (req, res, next) => {
    try {
        const [rows] = await poolBsm.queryWithRetry(
            `SELECT
        k.kar_Nik AS nik,
        k.kar_nama AS nama,
        j.jab_nama AS jabatan,
        p.pab_nama AS unit,
        COALESCE(k.kar_GAPOK, 0) AS gapok,
        COALESCE(k.kar_T_KOMPETENSI, 0) AS tkompetensi,
        COALESCE(k.kar_T_JABATAN, 0) AS tjabatan,
        COALESCE(k.kar_T_LAIN, 0) AS tabsensi,
        COALESCE(k.kar_T_bpjstk, 0) AS bpjstk,
        COALESCE(k.kar_T_BPJS, 0) AS bpjs,
        COALESCE(k.kar_t_koperasi, 0) AS koperasi,
        COALESCE(k.kar_T_PPH21, 0) AS pph21,
        COALESCE(k.kar_rekeningbank, '') AS rekening,
        COALESCE(k.kar_email, '') AS email,
        COALESCE(k.kar_tunai, 0) AS tunai,
        COALESCE(k.kar_t_sewakendaraan, 0) AS sewakendaraan,
        COALESCE(k.kar_gajibpjs, 0) AS capbpjs,
        k.kar_jab_kode AS kodejabatan
      FROM tkaryawan k
      LEFT JOIN tjabatan j ON j.jab_kode = k.kar_jab_kode
      JOIN tpabrik p ON p.pab_kode = k.kar_pab_kode
      WHERE k.kar_status_aktif = 1
        AND k.kar_sistem_gaji IN ('Harian', 'Bulanan')
        AND k.kar_GAPOK > 0
        AND ${FILTER_UNIT_BSM}
      ORDER BY k.kar_Nik`
        )

        success(res, rows, `${rows.length} karyawan aktif unit PT Bumi Sarana Maju dimuat`)

    } catch (err) {
        next(err)
    }
}

/**
 * GET /api/gaji-bsm?periode=&tahun=
 * Data gaji BSM yang sudah tersimpan pada satu periode.
 * Setara InsertNilai2 di Delphi.
 */
export const getGajiBsm = async (req, res, next) => {
    try {
        const periode = parseInt(req.query.periode)
        const tahun = parseInt(req.query.tahun)

        if (!periode || periode < 1 || periode > 12) {
            return error(res, 'Periode (bulan) tidak valid', 400)
        }
        if (!tahun || tahun < 2000 || tahun > 2100) {
            return error(res, 'Tahun tidak valid', 400)
        }

        const [rows] = await poolBsm.queryWithRetry(
            `SELECT
        g.gb_nik AS nik,
        g.gb_nama AS nama,
        COALESCE(g.gb_jabatan, j.jab_nama, '') AS jabatan,
        COALESCE(g.gb_unit, p.pab_nama, '') AS unit,
        COALESCE(g.gb_gapok, 0) AS gapok,
        COALESCE(g.gb_tunjangankompetensi, 0) AS tkompetensi,
        COALESCE(g.gb_tunjanganjabatan, 0) AS tjabatan,
        COALESCE(g.gb_potonganjabatan, 0) AS potjabatan,
        COALESCE(g.gb_tunjanganabsensi, 0) AS tabsensi,
        COALESCE(g.gb_bpjstk, 0) AS bpjstk,
        COALESCE(g.gb_bpjs, 0) AS bpjs,
        COALESCE(g.gb_koperasi, 0) AS koperasi,
        COALESCE(g.gb_haritidakmasuk, 0) AS tidakmasuk,
        COALESCE(g.gb_hariterlambat, 0) AS terlambat,
        COALESCE(g.gb_potonganhari, 0) AS potonghari,
        COALESCE(g.gb_angsuran, 0) AS angsuran,
        COALESCE(g.gb_pph21, 0) AS pph21,
        COALESCE(k.kar_rekeningbank, '') AS rekening,
        COALESCE(k.kar_email, '') AS email,
        COALESCE(k.kar_tunai, 0) AS tunai,
        COALESCE(k.kar_t_sewakendaraan, 0) AS sewakendaraan,
        COALESCE(k.kar_gajibpjs, 0) AS capbpjs,
        k.kar_jab_kode AS kodejabatan
      FROM tgajibulanan g
      LEFT JOIN tkaryawan k ON k.kar_Nik = g.gb_nik
      LEFT JOIN tjabatan j ON j.jab_kode = k.kar_jab_kode
      JOIN tpabrik p ON p.pab_kode = k.kar_pab_kode
      WHERE g.gb_periode = ? AND g.gb_tahun = ?
        AND ${FILTER_UNIT_BSM}
      ORDER BY g.gb_nik`,
            [periode, tahun]
        )

        const data = rows.map((r) => ({ ...r, ...hitungGajiBsm(r) }))

        success(res, {
            periode,
            tahun,
            rows: data,
            jumlah: data.length,
        }, data.length > 0
            ? `${data.length} data gaji BSM tersimpan untuk periode ${periode}/${tahun}`
            : `Belum ada data gaji BSM untuk periode ${periode}/${tahun}`)

    } catch (err) {
        next(err)
    }
}

/**
 * GET /api/gaji-bsm/absensi?start_date=&end_date=
 *
 * Tarik data absensi untuk mengisi kolom Tidak Masuk / Terlambat / Pot. Hari
 * dari rekap absensi di SERVER UTAMA (procedure rekap_absensiv3) — sama
 * dengan sumber yang dipakai Laporan Rekap Absensi.
 *
 * Server kedua (BSM) tidak punya routine rekap_absensiv2 & datanya mentok
 * 2021, jadi absensi diambil dari server utama lalu dicocokkan NIK-nya.
 *
 * Pemetaan ke kolom gaji (persis Button3Click di ufrmProsesGaji.pas baris
 * 879-881):
 *   terLambat  <- Terlambat
 *   tidakMasuk <- CutiTahunan + Sakit + CutiKhusus
 *   potongHari <- Potong_Gaji
 */
export const getAbsensiBsm = async (req, res, next) => {
    try {
        const startDate = String(req.query.start_date || '').trim()
        const endDate = String(req.query.end_date || '').trim()

        if (!startDate || !endDate) {
            return error(res, 'Rentang tanggal absensi wajib diisi', 400)
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
            return error(res, 'Format tanggal harus YYYY-MM-DD', 400)
        }
        if (startDate > endDate) {
            return error(res, 'Tanggal awal tidak boleh melewati tanggal akhir', 400)
        }

        // NIK yang boleh masuk proses gaji BSM (unit PT Bumi Sarana Maju)
        const [nikRows] = await poolBsm.queryWithRetry(
            `SELECT k.kar_Nik AS nik
       FROM tkaryawan k
       JOIN tpabrik p ON p.pab_kode = k.kar_pab_kode
       WHERE k.kar_status_aktif = 1
         AND k.kar_sistem_gaji IN ('Harian', 'Bulanan')
         AND k.kar_GAPOK > 0
         AND ${FILTER_UNIT_BSM}`
        )
        const nikBsm = new Set(nikRows.map((r) => String(r.nik).trim()))

        // CALL pada mysql2 terbungkus satu level lebih dalam:
        // hasil = [ [ {baris...}, {okPacket} ] ]
        const [result] = await poolUtama.query('CALL rekap_absensiv3(?, ?, ?)', [startDate, endDate, '%'])
        const semua = (Array.isArray(result?.[0]) ? result[0] : (Array.isArray(result) ? result : []))
            .filter((r) => r && nikBsm.has(String(r.Nik).trim()))

        const rows = semua.map((r) => {
            const tidakMasuk = num(r.CutiTahunan) + num(r.Sakit) + num(r.CutiKhusus)
            return {
                nik: String(r.Nik).trim(),
                nama: r.Nama || '',
                unit: r.Cabang || '',
                hari: num(r.Hari),
                setengahHari: num(r.SetengahHari),
                masuk: num(r.Masuk),
                terlambat: num(r.Terlambat),
                tidakmasuk: tidakMasuk,
                potonghari: num(r.Potong_Gaji),
                keterangan: r.Keterangan || '',
            }
        })

        const tanpaData = [...nikBsm].filter((n) => !rows.some((r) => r.nik === n))

        success(res, {
            start_date: startDate,
            end_date: endDate,
            rows,
            jumlah: rows.length,
            tanpaData,
            totalNik: nikBsm.size,
        }, `Rekap absensi ${rows.length} dari ${nikBsm.size} karyawan unit PT Bumi Sarana Maju` +
            (tanpaData.length > 0 ? `, ${tanpaData.length} karyawan tanpa data absensi` : ''))

    } catch (err) {
        next(err)
    }
}

/**
 * POST /api/gaji-bsm/simpan
 * Simpan hasil proses: hapus dulu periode tsb, lalu insert ulang
 * (persis seperti simpandata di Delphi) dalam satu transaksi.
 */
export const simpanGajiBsm = async (req, res, next) => {
    const conn = await poolBsm.getConnectionWithRetry()

    try {
        const periode = parseInt(req.body?.periode)
        const tahun = parseInt(req.body?.tahun)
        const rows = Array.isArray(req.body?.rows) ? req.body.rows : []

        if (!periode || periode < 1 || periode > 12) {
            return error(res, 'Periode (bulan) tidak valid', 400)
        }
        if (!tahun || tahun < 2000 || tahun > 2100) {
            return error(res, 'Tahun tidak valid', 400)
        }

        const isi = rows.filter((r) => String(r?.nik || '').trim() !== '')
        if (isi.length === 0) {
            return error(res, 'Tidak ada data untuk disimpan', 400)
        }

        // Cegah NIK ganda dalam satu payload
        const nikUnique = new Set()
        for (const r of isi) {
            const nik = String(r.nik).trim()
            if (nikUnique.has(nik)) {
                return error(res, `NIK ${nik} muncul lebih dari sekali`, 400)
            }
            nikUnique.add(nik)
        }

        await conn.beginTransaction()

        await conn.query('DELETE FROM tgajibulanan WHERE gb_periode = ? AND gb_tahun = ?', [periode, tahun])

        const values = isi.map((r) => [
            periode,
            tahun,
            String(r.nik).trim(),
            String(r.nama || ''),
            String(r.unit || ''),
            String(r.jabatan || ''),
            num(r.gapok),
            num(r.tjabatan),
            num(r.tkompetensi),
            num(r.tabsensi),
            num(r.bpjstk),
            num(r.bpjs),
            num(r.koperasi),
            num(r.tidakmasuk),
            num(r.terlambat),
            num(r.potonghari),
            num(r.angsuran),
            num(r.pph21),
            num(r.potjabatan),
        ])

        const CHUNK = 200
        for (let i = 0; i < values.length; i += CHUNK) {
            const slice = values.slice(i, i + CHUNK)
            const placeholders = slice.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ')
            await conn.query(
                `INSERT INTO tgajibulanan
          (gb_periode, gb_tahun, gb_nik, gb_nama, gb_unit, gb_jabatan,
           gb_gapok, gb_tunjanganjabatan, gb_tunjangankompetensi, gb_tunjanganabsensi,
           gb_bpjstk, gb_bpjs, gb_koperasi, gb_haritidakmasuk, gb_hariterlambat,
           gb_potonganhari, gb_angsuran, gb_pph21, gb_potonganjabatan)
        VALUES ${placeholders}`,
                slice.flat()
            )
        }

        await conn.commit()

        success(res, { periode, tahun, jumlah: isi.length },
            `Gaji BSM periode ${periode}/${tahun} berhasil disimpan (${isi.length} karyawan)`)

    } catch (err) {
        await conn.rollback()
        next(err)
    } finally {
        conn.release()
    }
}

/**
 * GET /api/gaji-bsm/smtp-test
 * Cek konfigurasi & koneksi SMTP tanpa mengirim email.
 */
export const tesSmtpBsm = async (req, res, next) => {
    try {
        const transporter = smtpTransporter()
        if (!transporter) {
            return error(res, 'Konfigurasi SMTP belum diisi di server (SMTP_HOST/SMTP_USER/SMTP_PASS)', 500)
        }
        await transporter.verify()
        success(res, null, 'Koneksi SMTP OK, siap kirim email')
    } catch (err) {
        next(err)
    }
}

/**
 * POST /api/gaji-bsm/kirim-slip
 * Kirim slip gaji (PDF) ke email satu karyawan (database BSM).
 * Body: { nik, subject, message, filename, pdfBase64 }
 */
export const kirimSlipGajiBsm = async (req, res, next) => {
    try {
        const nik = String(req.body?.nik || '').trim()
        const hasil = await kirimSlipPdf({
            pool: poolBsm,
            nik,
            subject: String(req.body?.subject || '').trim(),
            message: String(req.body?.message || ''),
            filename: String(req.body?.filename || `${nik || 'slip'}.pdf`),
            pdfBase64: String(req.body?.pdfBase64 || ''),
            kolomNik: 'kar_Nik',
        })
        success(res, hasil, `Slip gaji terkirim ke ${hasil.email}`)
    } catch (err) {
        if (err.statusCode) return error(res, err.message, err.statusCode)
        next(err)
    }
}
