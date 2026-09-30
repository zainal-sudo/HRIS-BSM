import express, { Router } from 'express'
import { verifyToken } from './middleware/auth.js'
import FormData from 'form-data'
import fetch from 'node-fetch'
// Controllers
import { login, logout, refresh } from './controllers/authController.js'
import { getAllKaryawan, getKaryawanById, createKaryawan, updateKaryawan, deleteKaryawan, getFormOptions, getAllUnit, getAllJabatan, getAllDepartemen, generateNik, syncKaryawanTarget } from './controllers/karyawanController.js'
import {
    getAllHakUser, getHakByUser, saveHak,
    getAllParent, createParent, updateParent, deleteParent,
    getAllItems, createItem, updateItem, deleteItem, getMenuByUser
} from './controllers/menuController.js'
import { getReportKontrak, updateStatusPkwt } from './controllers/report/kontrakController.js'
import { getAllPkwt, getMaxKode, getPkwtById, getKaryawanDetail, getRiwayatPkwt, createPkwt, updatePkwt, deletePkwt, lookupKaryawanAktif } from './controllers/pkwtController.js'
import {
    getAllJabatan as getAllJabatanMaster,
    getJabatanById,
    createJabatan,
    updateJabatan,
    deleteJabatan
} from './controllers/jabatanController.js'
import {
    getAllDepartemen as getAllDepartemenMaster,
    getDepartemenById,
    createDepartemen,
    updateDepartemen,
    deleteDepartemen
} from './controllers/departemenController.js'
import {
    getAllUnit as getAllUnitMaster,
    getUnitById,
    createUnit,
    updateUnit,
    deleteUnit
} from './controllers/unitController.js'
import { getLaporanAbsensi } from './controllers/report/absensiController.js'
import { getRekapAbsensi } from './controllers/report/rekapAbsensiController.js'
import {
    getAllIzin,
    getMaxKode as getMaxKodeIzin,
    getIzinById,
    getDetailKaryawan,
    getAlasanOptions,
    createIzin,
    updateIzin,
    deleteIzin,
    createIzinBatch
} from './controllers/izinController.js'
import {
    getAllLembur,
    getMaxKode as getMaxKodeLembur,
    getLemburById,
    getDetailKaryawan as getDetailKaryawanLembur,
    createLembur,
    updateLembur,
    deleteLembur,
    uploadFoto as uploadFotoLembur,
    createLemburBatch
} from './controllers/lemburController.js'
import {
    getSummary,
    getKaryawanPerBulan,
    getKontrakBerakhirPerBulan,
    getIzinHariIni,
    getLemburHariIni,
    getAktivitasTerbaru,
    getOrganisasi
} from './controllers/dashboardController.js'
import {
    getKaryawanRoti,
    getAbsensiRoti,
    getGajiRoti,
    simpanGajiRoti,
    kirimSlipGaji,
    tesSmtp
} from './controllers/gajiRotiController.js'
import {
    getKaryawanBsm,
    getAbsensiBsm,
    getGajiBsm,
    simpanGajiBsm,
    kirimSlipGajiBsm,
    tesSmtpBsm
} from './controllers/gajiBsmController.js'
import {
    getAllKeluar,
    getMaxKode as getMaxKodeKeluar,
    getKeluarById,
    getDetailKaryawan as getDetailKaryawanKeluar,
    createKeluar,
    updateKeluar,
    deleteKeluar
} from './controllers/keluarController.js'
import {
    getPabrikSettingGaji,
    getSettingGaji,
    saveSettingGaji
} from './controllers/settingGajiBsmController.js'
import {
    getKaryawanN3,
    getAbsensiN3,
    getGajiN3,
    simpanGajiN3,
    kirimSlipGajiN3,
    tesSmtpN3
} from './controllers/gajiN3Controller.js'
import {
    getSettingGajiN3,
    saveSettingGajiN3
} from './controllers/settingGajiN3Controller.js'
import {
    getUnitSettingGajiRoti,
    getSettingGajiRoti,
    saveSettingGajiRoti
} from './controllers/settingGajiRotiController.js'
import {
    getUnitSettingGajiPkrt,
    getSettingGajiPkrt,
    saveSettingGajiPkrt
} from './controllers/settingGajiPkrtController.js'
import {
    getKaryawanPkrt,
    getAbsensiPkrt,
    getGajiPkrt,
    simpanGajiPkrt,
    kirimSlipGajiPkrt,
    tesSmtpPkrt
} from './controllers/gajiPkrtController.js'

// 🔥 Middleware upload (Express v5 ke atas)
import multer from 'multer'
const upload = multer({ storage: multer.memoryStorage() })

const router = Router()

// ==================== PUBLIC ====================
router.post('/auth/login', login)
router.post('/auth/refresh', refresh)

// ==================== PROTECTED ====================
router.use(verifyToken)

router.post('/auth/logout', logout)

// Karyawan
router.get('/karyawan/form-options', getFormOptions)
router.post('/karyawan/sync-target', syncKaryawanTarget)
router.get('/karyawan', getAllKaryawan)
router.get('/karyawan/:id', getKaryawanById)
router.post('/karyawan/generate-nik', generateNik)
router.post('/karyawan', createKaryawan)
router.put('/karyawan/:id', updateKaryawan)
router.delete('/karyawan/:id', deleteKaryawan)

// 🔥 Hak User
router.get('/hak-user/all', getAllHakUser)
router.get('/hak-user/:userKode', getHakByUser)
router.post('/hak-user', saveHak)

// 🔥 Menu Parent
router.get('/menu-parent', getAllParent)
router.post('/menu-parent', createParent)
router.put('/menu-parent/:id', updateParent)
router.delete('/menu-parent/:id', deleteParent)

// 🔥 Menu Items
router.get('/menu-items', getAllItems)
router.post('/menu-items', createItem)
router.put('/menu-items/:id', updateItem)
router.delete('/menu-items/:id', deleteItem)

// 🔥 Menu by User
router.get('/menu/user/:userKode', getMenuByUser)

// 🔥 Lookup
router.get('/lookup/unit', getAllUnit)
router.get('/lookup/jabatan', getAllJabatan)
router.get('/lookup/departemen', getAllDepartemen)

router.get('/report/kontrak-berakhir', getReportKontrak)
router.put('/kontrak/update-status', updateStatusPkwt)

// PKWT
router.get('/pkwt/max-kode', getMaxKode)
router.get('/pkwt/karyawan/:nik', getKaryawanDetail)
router.get('/pkwt/riwayat/:nik', getRiwayatPkwt)
router.get('/pkwt', getAllPkwt)
router.get('/pkwt/:id', getPkwtById)
router.post('/pkwt', createPkwt)
router.put('/pkwt/:id', updatePkwt)
router.delete('/pkwt/:id', deletePkwt)

// Lookup Karyawan Aktif
router.get('/lookup/karyawan-aktif', lookupKaryawanAktif)

// Jabatan
router.get('/jabatan', getAllJabatanMaster)
router.get('/jabatan/:id', getJabatanById)
router.post('/jabatan', createJabatan)
router.put('/jabatan/:id', updateJabatan)
router.delete('/jabatan/:id', deleteJabatan)

// Departemen
router.get('/departemen', getAllDepartemenMaster)
router.get('/departemen/:id', getDepartemenById)
router.post('/departemen', createDepartemen)
router.put('/departemen/:id', updateDepartemen)
router.delete('/departemen/:id', deleteDepartemen)

// Unit
router.get('/unit', getAllUnitMaster)
router.get('/unit/:id', getUnitById)
router.post('/unit', createUnit)
router.put('/unit/:id', updateUnit)
router.delete('/unit/:id', deleteUnit)

// Laporan Absensi
router.get('/laporan/absensi', getLaporanAbsensi)

// Laporan Rekap Absensi
router.get('/laporan/rekap-absensi', getRekapAbsensi)

// Transaksi Izin
router.get('/izin', getAllIzin)
router.get('/izin/max-kode', getMaxKodeIzin)
router.get('/izin/alasan-options', getAlasanOptions)
router.get('/izin/:id', getIzinById)
router.get('/izin/karyawan/:nik', getDetailKaryawan)
router.post('/izin', createIzin)
router.put('/izin/:id', updateIzin)
router.delete('/izin/:id', deleteIzin)
router.post('/izin/batch', createIzinBatch)

// 🔥 PROXY UPLOAD (ganti route /izin/upload)
router.post('/izin/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'File tidak ditemukan' })
        }

        const formData = new FormData()
        formData.append('file', req.file.buffer, {
            filename: req.file.originalname,
            contentType: req.file.mimetype
        })
        formData.append('prefix', req.body.prefix || 'IZ')

        const response = await fetch('http://103.103.22.7/cutikaryawan/upload.php', {
            method: 'POST',
            body: formData
        })

        const result = await response.json()
        res.json(result)

    } catch (err) {
        console.error('❌ Proxy upload error:', err)
        res.status(500).json({ success: false, message: 'Gagal upload melalui proxy' })
    }
})

router.get('/lembur', getAllLembur)
router.get('/lembur/max-kode', getMaxKodeLembur)
router.get('/lembur/:id', getLemburById)
router.get('/lembur/karyawan/:nik', getDetailKaryawanLembur)
router.post('/lembur', createLembur)
router.put('/lembur/:id', updateLembur)
router.delete('/lembur/:id', deleteLembur)
router.post('/lembur/upload', upload.single('file'), uploadFotoLembur)
router.post('/lembur/batch', createLemburBatch)

router.get('/dashboard/summary', getSummary)
router.get('/dashboard/karyawan-per-bulan', getKaryawanPerBulan)
router.get('/dashboard/kontrak-berakhir-per-bulan', getKontrakBerakhirPerBulan)
router.get('/dashboard/izin-hari-ini', getIzinHariIni)
router.get('/dashboard/lembur-hari-ini', getLemburHariIni)
router.get('/dashboard/aktivitas-terbaru', getAktivitasTerbaru)
router.get('/dashboard/organisasi', getOrganisasi)

router.get('/keluar', getAllKeluar)
router.get('/keluar/max-kode', getMaxKodeKeluar)
router.get('/keluar/:id', getKeluarById)
router.get('/keluar/karyawan/:nik', getDetailKaryawanKeluar)
router.post('/keluar', createKeluar)
router.put('/keluar/:id', updateKeluar)
router.delete('/keluar/:id', deleteKeluar)

// Proses Gaji Roti
router.get('/gaji-roti/karyawan', getKaryawanRoti)
router.get('/gaji-roti/absensi', getAbsensiRoti)
router.get('/gaji-roti', getGajiRoti)
router.post('/gaji-roti/simpan', simpanGajiRoti)
router.post('/gaji-roti/kirim-slip', express.json({ limit: '8mb' }), kirimSlipGaji)
router.get('/gaji-roti/smtp-test', tesSmtp)

// Proses Gaji BSM (duplikasi ufrmProsesGaji Delphi, database server kedua)
router.get('/gaji-bsm/karyawan', getKaryawanBsm)
router.get('/gaji-bsm/absensi', getAbsensiBsm)
router.get('/gaji-bsm', getGajiBsm)
router.post('/gaji-bsm/simpan', simpanGajiBsm)
router.post('/gaji-bsm/kirim-slip', express.json({ limit: '8mb' }), kirimSlipGajiBsm)
router.get('/gaji-bsm/smtp-test', tesSmtpBsm)

// Setting Gaji BSM (duplikasi ufrmSettingGaji Delphi, database server kedua)
router.get('/setting-gaji-bsm/pabrik', getPabrikSettingGaji)
router.get('/setting-gaji-bsm', getSettingGaji)
router.put('/setting-gaji-bsm', saveSettingGaji)

// Proses Gaji N3 (duplikasi ufrmProsesGaji Delphi HRD N3: PT Entri Jaya
// Makmur unit 6, database hrd_entri)
router.get('/gaji-n3/karyawan', getKaryawanN3)
router.get('/gaji-n3/absensi', getAbsensiN3)
router.get('/gaji-n3', getGajiN3)
router.post('/gaji-n3/simpan', simpanGajiN3)
router.post('/gaji-n3/kirim-slip', express.json({ limit: '8mb' }), kirimSlipGajiN3)
router.get('/gaji-n3/smtp-test', tesSmtpN3)

// Setting Gaji N3 (duplikasi ufrmSettingGaji Delphi HRD N3, unit 6)
router.get('/setting-gaji-n3', getSettingGajiN3)
router.put('/setting-gaji-n3', saveSettingGajiN3)

// Setting Gaji Roti (hanya gapok, gaji per hari = gapok / 26 read only)
router.get('/setting-gaji-roti/unit', getUnitSettingGajiRoti)
router.get('/setting-gaji-roti', getSettingGajiRoti)
router.put('/setting-gaji-roti', saveSettingGajiRoti)

// 🔥 Setting Gaji PKRT (PT Entri Jaya Makmur PKRT - unit 20)
// Gapok + tunjangan jabatan/kompetensi/makan + seluruh potongan per karyawan
router.get('/setting-gaji-pkrt/unit', getUnitSettingGajiPkrt)
router.get('/setting-gaji-pkrt', getSettingGajiPkrt)
router.put('/setting-gaji-pkrt', saveSettingGajiPkrt)

// 🔥 Proses Gaji PKRT (unit 20, tabel tgajibulananpkrt)
router.get('/gaji-pkrt/karyawan', getKaryawanPkrt)
router.get('/gaji-pkrt/absensi', getAbsensiPkrt)
router.get('/gaji-pkrt', getGajiPkrt)
router.post('/gaji-pkrt/simpan', simpanGajiPkrt)
router.post('/gaji-pkrt/kirim-slip', express.json({ limit: '8mb' }), kirimSlipGajiPkrt)
router.get('/gaji-pkrt/smtp-test', tesSmtpPkrt)

export default router