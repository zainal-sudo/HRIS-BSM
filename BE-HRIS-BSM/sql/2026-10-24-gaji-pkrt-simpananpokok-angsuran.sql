-- =====================================================================
--  MODUL GAJI PKRT — kolom Simpanan Pokok & Angsuran
--  Menambah 2 kolom di tgajibulananpkrt (mengikuti pola modul N3):
--    gb_simpananpokok : simpanan pokok koperasi (info, tampil di slip,
--                       tidak mengurangi Total Potongan)
--    gb_angsuran      : angsuran koperasi periode ini (mengurangi
--                       Total Potongan, ikut rumus hitungGajiPkrt)
--  Database: hrd di server utama (103.103.22.7) -> config/database.js
--  Tidak destructive: aman dijalankan berkali-kali.
-- =====================================================================
SET @db = DATABASE();

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tgajibulananpkrt' AND COLUMN_NAME = 'gb_simpananpokok') = 0,
  'ALTER TABLE tgajibulananpkrt ADD COLUMN gb_simpananpokok DOUBLE DEFAULT NULL COMMENT ''Simpanan Pokok koperasi (info slip)'' AFTER gb_simpankoperasi',
  'SELECT 1');

PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tgajibulananpkrt' AND COLUMN_NAME = 'gb_angsuran') = 0,
  'ALTER TABLE tgajibulananpkrt ADD COLUMN gb_angsuran DOUBLE DEFAULT NULL COMMENT ''Angsuran (potongan)'' AFTER gb_cicilan',
  'SELECT 1');

PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
