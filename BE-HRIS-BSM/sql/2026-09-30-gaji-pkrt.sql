-- =====================================================================
--  MODUL GAJI PKRT  (PT Entri Jaya Makmur PKRT / unit 20)
--  Rujukan: D:\PKRT sept 2026 Payroll.xlsx  (sheet "all+rekap")
--  Database: hrd di server utama (103.103.22.7) -> config/database.js
--
--  Rumus mengikuti sel Excel "all+rekap":
--    THP               = GAPOK + T JABATAN + T KOMPETENSI + T MAKAN
--    rupiah lembur     = (1/173) * poin * THP
--    insentif shift    = jml hari insentif * 7000
--    nominal pot gaji  = (jml hari dipot / 25) * THP
--    gaji              = THP + lembur + insentif
--                        - PPh21 - BPJS Kes - BPJS Naker - Simpanan Kop
--                        - Cicilan - nominal pot gaji
--    gaji (bulat)      = ROUND(gaji, 0)
--
--  Tidak destructive: aman dijalankan berkali-kali.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabel hasil proses gaji PKRT
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tgajibulananpkrt (
  gb_periode            TINYINT      NOT NULL                COMMENT 'bulan 1-12',
  gb_tahun              SMALLINT     NOT NULL                COMMENT 'tahun',
  gb_nik                VARCHAR(255) NOT NULL                COMMENT 'NIK karyawan',
  gb_nama               VARCHAR(255) DEFAULT NULL             COMMENT 'nama karyawan',
  gb_jabatan            VARCHAR(100) DEFAULT NULL             COMMENT 'jabatan saat proses',
  gb_unit               VARCHAR(100) DEFAULT NULL             COMMENT 'unit (PT Entri Jaya Makmur PKRT)',
  gb_rekening           VARCHAR(50)  DEFAULT NULL             COMMENT 'no rekening transfer',
  gb_email              VARCHAR(255) DEFAULT NULL             COMMENT 'email slip gaji',

  -- penghasilan
  gb_gapok              DOUBLE       DEFAULT NULL             COMMENT 'GAPOK',
  gb_tunjanganjabatan   DOUBLE       DEFAULT NULL             COMMENT 'T JABATAN',
  gb_tunjangankompetensi DOUBLE      DEFAULT NULL             COMMENT 'T KOMPETENSI',
  gb_tunjanganmakan     DOUBLE       DEFAULT NULL             COMMENT 'T MAKAN',
  gb_thp                DOUBLE       DEFAULT NULL             COMMENT 'THP = gapok + 3 tunjangan',
  gb_poin               DOUBLE       DEFAULT NULL             COMMENT 'poin lembur',
  gb_lembur             DOUBLE       DEFAULT NULL             COMMENT 'rupiah lembur = poin/173*THP',
  gb_hariinsentif       DOUBLE       DEFAULT NULL             COMMENT 'jml hari insentif shift malam',
  gb_insentif           DOUBLE       DEFAULT NULL             COMMENT 'nominal insentif = hari*7000',

  -- potongan
  gb_pph21              DOUBLE       DEFAULT NULL             COMMENT 'POT PPH21 bulanan',
  gb_bpjskesehatan      DOUBLE       DEFAULT NULL             COMMENT 'Pot. BPJS Kesehatan',
  gb_bpjstk             DOUBLE       DEFAULT NULL             COMMENT 'Pot. BPJS Ketenagakerjaan',
  gb_simpankoperasi     DOUBLE       DEFAULT NULL             COMMENT 'Simpanan Kop',
  gb_cicilan            DOUBLE       DEFAULT NULL             COMMENT 'cicilan',
  gb_haripotong         DOUBLE       DEFAULT NULL             COMMENT 'jml hari dipot',
  gb_nominalpotgaji     DOUBLE       DEFAULT NULL             COMMENT 'nominal pot gaji = hari/25*THP',

  -- hasil
  gb_potongan           DOUBLE       DEFAULT NULL             COMMENT 'total seluruh potongan',
  gb_gaji               DOUBLE       DEFAULT NULL             COMMENT 'gaji (belum dibulatkan)',
  gb_gajibulat          DOUBLE       DEFAULT NULL             COMMENT 'gaji (dibulatkan, untuk transfer)',

  gb_tanggal            DATE         DEFAULT NULL             COMMENT 'tanggal proses',
  gb_created_at         DATETIME     DEFAULT CURRENT_TIMESTAMP,
  gb_updated_at         DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (gb_periode, gb_tahun, gb_nik),
  KEY ix_tgajibulananpkrt_nik (gb_nik)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Gaji bulanan PKRT (PT Entri Jaya Makmur PKRT)';

-- ---------------------------------------------------------------------
-- 2. Kolom setting gaji PKRT di tkaryawan
--    kar_gaji_pokok & kar_tunjangan_jabatan sudah ada; sisanya baru.
--    Semua kolom ini hanya dipakai modul Setting/Proses Gaji PKRT.
-- ---------------------------------------------------------------------
SET @db = DATABASE();

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tkaryawan' AND COLUMN_NAME = 'kar_tunjangan_kompetensi') = 0,
  'ALTER TABLE tkaryawan ADD COLUMN kar_tunjangan_kompetensi DOUBLE DEFAULT NULL COMMENT ''Tunj. Kompetensi PKRT'' AFTER kar_tunjangan_jabatan',
  'SELECT 1');

PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tkaryawan' AND COLUMN_NAME = 'kar_tunjangan_makan') = 0,
  'ALTER TABLE tkaryawan ADD COLUMN kar_tunjangan_makan DOUBLE DEFAULT NULL COMMENT ''Tunj. Makan PKRT'' AFTER kar_tunjangan_kompetensi',
  'SELECT 1');

PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tkaryawan' AND COLUMN_NAME = 'kar_pph21') = 0,
  'ALTER TABLE tkaryawan ADD COLUMN kar_pph21 DOUBLE DEFAULT NULL COMMENT ''Pot. PPh21 bulanan PKRT'' AFTER kar_tunjangan_makan',
  'SELECT 1');

PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tkaryawan' AND COLUMN_NAME = 'kar_bpjs_kesehatan') = 0,
  'ALTER TABLE tkaryawan ADD COLUMN kar_bpjs_kesehatan DOUBLE DEFAULT NULL COMMENT ''Pot. BPJS Kesehatan PKRT'' AFTER kar_pph21',
  'SELECT 1');

PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tkaryawan' AND COLUMN_NAME = 'kar_bpjs_ketenagakerjaan') = 0,
  'ALTER TABLE tkaryawan ADD COLUMN kar_bpjs_ketenagakerjaan DOUBLE DEFAULT NULL COMMENT ''Pot. BPJS Ketenagakerjaan PKRT'' AFTER kar_bpjs_kesehatan',
  'SELECT 1');

PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tkaryawan' AND COLUMN_NAME = 'kar_simpanan_koperasi') = 0,
  'ALTER TABLE tkaryawan ADD COLUMN kar_simpanan_koperasi DOUBLE DEFAULT NULL COMMENT ''Simpanan Kop PKRT'' AFTER kar_bpjs_ketenagakerjaan',
  'SELECT 1');

PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tkaryawan' AND COLUMN_NAME = 'kar_cicilan') = 0,
  'ALTER TABLE tkaryawan ADD COLUMN kar_cicilan DOUBLE DEFAULT NULL COMMENT ''Cicilan PKRT'' AFTER kar_simpanan_koperasi',
  'SELECT 1');

PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------
-- 3. Menu aplikasi (sidebar diambil dari tmenu)
--    1 = Master, 2 = Transaksi
-- ---------------------------------------------------------------------
INSERT INTO tmenu
  (MEN_NAMA, MEN_NAMA2, MEN_KETERANGAN, men_modul, men_icon, men_route, men_parent_id, men_order)
SELECT
  'frmSettingGajiPkrt', 'Setting Gaji PKRT', 'Tunjangan & potongan PKRT', 1,
  'pi pi-wallet', '/master/setting-gaji-pkrt', 1, 8
WHERE NOT EXISTS (
  SELECT 1 FROM tmenu WHERE men_route = '/master/setting-gaji-pkrt'
);

INSERT INTO tmenu
  (MEN_NAMA, MEN_NAMA2, MEN_KETERANGAN, men_modul, men_icon, men_route, men_parent_id, men_order)
SELECT
  'frmProsesGajiPkrt', 'Proses Gaji PKRT', 'Proses gaji bulanan PKRT', 1,
  'pi pi-wallet', '/transaksi/proses-gaji-pkrt', 2, 8
WHERE NOT EXISTS (
  SELECT 1 FROM tmenu WHERE men_route = '/transaksi/proses-gaji-pkrt'
);
