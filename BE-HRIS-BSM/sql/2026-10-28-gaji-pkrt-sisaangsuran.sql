-- =====================================================================
--  MODUL GAJI PKRT — kolom Sisa Angsuran (mengikuti modul N3)
--  Database: hrd di server utama (103.103.22.7) -> config/database.js
--  Tidak destructive: aman dijalankan berkali-kali.
-- =====================================================================
SET @db = DATABASE();

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tgajibulananpkrt' AND COLUMN_NAME = 'gb_sisaangsuran') = 0,
  'ALTER TABLE tgajibulananpkrt ADD COLUMN gb_sisaangsuran DOUBLE DEFAULT NULL COMMENT ''Sisa Angsuran (info slip)'' AFTER gb_angsuran',
  'SELECT 1');

PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
