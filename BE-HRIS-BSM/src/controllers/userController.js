import pool from '../config/database.js'
import { success, error } from '../helpers/response.js'

/**
 * Master User — merujuk ke Web Entri (masterUserService + masterUserFormService)
 * Disesuaikan ke skema HRIS:
 *   tuser   : user (PK), passw (plain-text, ikut authController), kd_unit, kar_nik
 *   tmenu   : MEN_ID, MEN_NAMA2, men_route, men_parent_id + tmenuparent
 *   thakuser: HAK_USER_KODE, HAK_MEN_ID, hak_men_insert/edit/delete
 *             (tanpa kolom view — adanya baris = boleh view, sama seperti Entri)
 */

/** GET /api/users — browse (kolom ala Entri: Kode, Unit, NIK) */
export const getBrowse = async (req, res, next) => {
    try {
        const [rows] = await pool.query(
            `SELECT
                u.user AS Kode,
                u.kd_unit AS KdUnit,
                t.nm_unit AS Unit,
                u.kar_nik AS Nik
            FROM tuser u
            LEFT JOIN tunit t ON u.kd_unit = t.kd_unit
            ORDER BY u.user`
        )
        success(res, rows)
    } catch (err) {
        next(err)
    }
}

/** GET /api/users/unit-list — dropdown unit (pengganti tcabang di Entri) */
export const getUnitList = async (req, res, next) => {
    try {
        const [rows] = await pool.query(
            `SELECT kd_unit AS kode, nm_unit AS nama FROM tunit ORDER BY nm_unit`
        )
        success(res, rows)
    } catch (err) {
        next(err)
    }
}

/** GET /api/users/menus — semua menu + parent (untuk checkbox hak akses) */
export const getAllMenus = async (req, res, next) => {
    try {
        const [rows] = await pool.query(
            `SELECT
                m.MEN_ID AS id,
                m.MEN_NAMA2 AS kode,
                m.MEN_KETERANGAN AS nama,
                m.men_parent_id AS parent_id,
                mp.mp_nama AS parent_nama,
                mp.mp_order AS parent_order,
                m.men_order AS urut
            FROM tmenu m
            LEFT JOIN tmenuparent mp ON m.men_parent_id = mp.mp_id
            WHERE mp.mp_aktif = 1 OR m.men_parent_id = 0
            ORDER BY mp.mp_order, m.men_order`
        )
        success(res, rows)
    } catch (err) {
        next(err)
    }
}

/** GET /api/users/detail/:kode — detail user + hak akses */
export const getDetail = async (req, res, next) => {
    try {
        const [users] = await pool.query(
            `SELECT
                u.user AS kode,
                u.kd_unit AS kd_unit,
                u.kar_nik AS kar_nik
            FROM tuser u
            WHERE u.user = ?`,
            [req.params.kode]
        )
        if (users.length === 0) {
            return error(res, 'User tidak ditemukan', 404)
        }

        const [menus] = await pool.query(
            `SELECT
                HAK_MEN_ID AS menu_id,
                'Y' AS view_,
                hak_men_insert AS insert_,
                hak_men_edit AS edit_,
                hak_men_delete AS delete_
            FROM thakuser
            WHERE HAK_USER_KODE = ?`,
            [req.params.kode]
        )

        success(res, { ...users[0], menus })
    } catch (err) {
        next(err)
    }
}

/**
 * POST /api/users/save
 * Body: { kode, password, kd_unit, kar_nik, menus: [{menu_id, view_, insert_, edit_, delete_}], isEdit }
 * Password kosong saat edit = jangan timpa (ikut Entri). Simpan plain-text ikut login HRIS.
 */
export const saveUser = async (req, res, next) => {
    const conn = await pool.getConnection()
    try {
        const { kode, password, kd_unit, kar_nik, menus, isEdit } = req.body

        if (!kode || !String(kode).trim()) {
            return error(res, 'Kode user wajib diisi', 400)
        }
        const userKode = String(kode).trim()

        await conn.beginTransaction()

        if (isEdit) {
            const [existing] = await conn.query(`SELECT user FROM tuser WHERE user = ?`, [userKode])
            if (existing.length === 0) {
                await conn.rollback()
                return error(res, 'User tidak ditemukan', 404)
            }
            if (password && String(password).trim()) {
                await conn.query(
                    `UPDATE tuser SET passw = ?, kd_unit = ?, kar_nik = ? WHERE user = ?`,
                    [String(password), kd_unit || null, kar_nik || null, userKode]
                )
            } else {
                await conn.query(
                    `UPDATE tuser SET kd_unit = ?, kar_nik = ? WHERE user = ?`,
                    [kd_unit || null, kar_nik || null, userKode]
                )
            }
        } else {
            const [existing] = await conn.query(`SELECT user FROM tuser WHERE user = ?`, [userKode])
            if (existing.length > 0) {
                await conn.rollback()
                return error(res, 'Kode user sudah digunakan', 409)
            }
            if (!password || !String(password).trim()) {
                await conn.rollback()
                return error(res, 'Password wajib diisi untuk user baru', 400)
            }
            await conn.query(
                `INSERT INTO tuser (user, passw, kd_unit, kar_nik) VALUES (?, ?, ?, ?)`,
                [userKode, String(password), kd_unit || null, kar_nik || null]
            )
        }

        // Hapus hak lama → insert ulang yang dicentang (ikut Entri)
        await conn.query(`DELETE FROM thakuser WHERE HAK_USER_KODE = ?`, [userKode])

        const filtered = Array.isArray(menus)
            ? menus.filter((m) => m.view_ === 'Y' || m.insert_ === 'Y' || m.edit_ === 'Y' || m.delete_ === 'Y')
            : []

        if (filtered.length > 0) {
            const values = filtered.map((m) => [
                userKode,
                m.menu_id,
                m.insert_ || 'N',
                m.edit_ || 'N',
                m.delete_ || 'N'
            ])
            await conn.query(
                `INSERT INTO thakuser (HAK_USER_KODE, HAK_MEN_ID, hak_men_insert, hak_men_edit, hak_men_delete) VALUES ?`,
                [values]
            )
        }

        await conn.commit()
        success(res, { kode: userKode }, 'User berhasil disimpan')
    } catch (err) {
        await conn.rollback()
        next(err)
    } finally {
        conn.release()
    }
}

/** DELETE /api/users/:kode — hapus user + haknya (pusat dilindungi) */
export const deleteUser = async (req, res, next) => {
    try {
        if (String(req.params.kode).toLowerCase() === 'pusat') {
            return error(res, 'User pusat tidak boleh dihapus', 400)
        }
        await pool.query(`DELETE FROM thakuser WHERE HAK_USER_KODE = ?`, [req.params.kode])
        const [result] = await pool.query(`DELETE FROM tuser WHERE user = ?`, [req.params.kode])
        if (result.affectedRows === 0) {
            return error(res, 'User tidak ditemukan', 404)
        }
        success(res, null, 'User berhasil dihapus')
    } catch (err) {
        next(err)
    }
}
