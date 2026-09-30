import pool from '../config/database.js'
import { success, error } from '../helpers/response.js'

/**
 * GET /api/hak-user/all
 * Get all users + all menus
 */
export const getAllHakUser = async (req, res, next) => {
    try {
        const [users] = await pool.query(
            `SELECT \`user\` AS USER_KODE, \`user\` AS USER_NAMA
       FROM tuser 
       ORDER BY \`user\``
        )

        const [menus] = await pool.query(
            `SELECT 
        m.MEN_ID, 
        m.MEN_NAMA2,
        m.MEN_NAMA,
        m.MEN_KETERANGAN,
        m.men_route,
        m.men_icon,
        m.men_order,
        m.men_parent_id,
        mp.mp_nama as parent_nama
      FROM tmenu m
      LEFT JOIN tmenuparent mp ON m.men_parent_id = mp.mp_id
      WHERE mp.mp_aktif = 1 OR m.men_parent_id = 0
      ORDER BY mp.mp_order, m.men_order`
        )

        success(res, { users, menus })

    } catch (err) {
        next(err)
    }
}

/**
 * GET /api/hak-user/:userKode
 * Get hak akses untuk user tertentu
 */
export const getHakByUser = async (req, res, next) => {
    try {
        const [rows] = await pool.query(
            `SELECT HAK_MEN_ID, hak_men_insert, hak_men_edit, hak_men_delete 
       FROM thakuser 
       WHERE HAK_USER_KODE = ?`,
            [req.params.userKode]
        )

        success(res, rows)

    } catch (err) {
        next(err)
    }
}

/**
 * POST /api/hak-user
 * Save hak user (delete semua dulu, insert ulang)
 * Body: { HAK_USER_KODE, items: [{ HAK_MEN_ID, hak_men_insert, hak_men_edit, hak_men_delete }] }
 */
export const saveHak = async (req, res, next) => {
    const conn = await pool.getConnection()

    try {
        const { HAK_USER_KODE, items } = req.body

        if (!HAK_USER_KODE) {
            return error(res, 'User kode diperlukan', 400)
        }

        await conn.beginTransaction()

        // Delete semua hak user ini dulu
        await conn.query('DELETE FROM thakuser WHERE HAK_USER_KODE = ?', [HAK_USER_KODE])

        // Insert ulang (hanya yang dikirim)
        if (items && items.length > 0) {
            for (const item of items) {
                await conn.query(
                    `INSERT INTO thakuser (HAK_USER_KODE, HAK_MEN_ID, hak_men_insert, hak_men_edit, hak_men_delete) 
           VALUES (?, ?, ?, ?, ?)`,
                    [
                        HAK_USER_KODE,
                        item.HAK_MEN_ID,
                        item.hak_men_insert || 'N',
                        item.hak_men_edit || 'N',
                        item.hak_men_delete || 'N'
                    ]
                )
            }
        }

        await conn.commit()

        success(res, null, 'Hak user berhasil disimpan')

    } catch (err) {
        await conn.rollback()
        next(err)
    } finally {
        conn.release()
    }
}


/**
 * GET /api/menu-parent
 */
export const getAllParent = async (req, res, next) => {
    try {
        const [rows] = await pool.query(
            'SELECT * FROM tmenuparent WHERE mp_aktif = 1 ORDER BY mp_order ASC'
        )
        success(res, rows)
    } catch (err) {
        next(err)
    }
}

/**
 * POST /api/menu-parent
 */
export const createParent = async (req, res, next) => {
    try {
        const [result] = await pool.query('INSERT INTO tmenuparent SET ?', req.body)
        const [rows] = await pool.query('SELECT * FROM tmenuparent WHERE mp_id = ?', [result.insertId])
        success(res, rows[0], 'Parent berhasil ditambahkan', 201)
    } catch (err) {
        next(err)
    }
}

/**
 * PUT /api/menu-parent/:id
 */
export const updateParent = async (req, res, next) => {
    try {
        await pool.query('UPDATE tmenuparent SET ? WHERE mp_id = ?', [req.body, req.params.id])
        const [rows] = await pool.query('SELECT * FROM tmenuparent WHERE mp_id = ?', [req.params.id])
        success(res, rows[0], 'Parent berhasil diupdate')
    } catch (err) {
        next(err)
    }
}

/**
 * DELETE /api/menu-parent/:id
 * Soft delete: set mp_aktif = 0
 */
export const deleteParent = async (req, res, next) => {
    try {
        await pool.query('UPDATE tmenuparent SET mp_aktif = 0 WHERE mp_id = ?', [req.params.id])
        success(res, null, 'Parent berhasil dinonaktifkan')
    } catch (err) {
        next(err)
    }
}

/**
 * GET /api/menu-items
 */
export const getAllItems = async (req, res, next) => {
    try {
        const [rows] = await pool.query(
            `SELECT 
        m.*,
        mp.mp_nama as parent_nama
      FROM tmenu m
      LEFT JOIN tmenuparent mp ON m.men_parent_id = mp.mp_id
      ORDER BY m.men_parent_id, m.men_order ASC`
        )
        success(res, rows)
    } catch (err) {
        next(err)
    }
}

/**
 * POST /api/menu-items
 */
export const createItem = async (req, res, next) => {
    try {
        const data = {
            MEN_NAMA: req.body.MEN_NAMA || '',
            MEN_NAMA2: req.body.MEN_NAMA2 || req.body.MEN_NAMA || '',
            MEN_KETERANGAN: req.body.MEN_KETERANGAN || '',
            men_icon: req.body.men_icon || 'pi pi-circle',
            men_route: req.body.men_route || '',
            men_parent_id: req.body.men_parent_id || 0,
            men_order: req.body.men_order || 0
        }

        const [result] = await pool.query('INSERT INTO tmenu SET ?', data)
        const [rows] = await pool.query(
            `SELECT m.*, mp.mp_nama as parent_nama 
       FROM tmenu m LEFT JOIN tmenuparent mp ON m.men_parent_id = mp.mp_id 
       WHERE m.MEN_ID = ?`,
            [result.insertId]
        )
        success(res, rows[0], 'Item berhasil ditambahkan', 201)
    } catch (err) {
        next(err)
    }
}

/**
 * PUT /api/menu-items/:id
 */
export const updateItem = async (req, res, next) => {
    try {
        const data = { ...req.body }

        // Kalau frontend kirim MEN_NAMA2, pakai itu
        // Kalau cuma kirim MEN_NAMA, copy ke MEN_NAMA2 juga
        if (data.MEN_NAMA && !data.MEN_NAMA2) {
            data.MEN_NAMA2 = data.MEN_NAMA
        }

        await pool.query('UPDATE tmenu SET ? WHERE MEN_ID = ?', [data, req.params.id])
        const [rows] = await pool.query(
            `SELECT m.*, mp.mp_nama as parent_nama 
       FROM tmenu m LEFT JOIN tmenuparent mp ON m.men_parent_id = mp.mp_id 
       WHERE m.MEN_ID = ?`,
            [req.params.id]
        )
        success(res, rows[0], 'Item berhasil diupdate')
    } catch (err) {
        next(err)
    }
}

/**
 * DELETE /api/menu-items/:id
 */
export const deleteItem = async (req, res, next) => {
    try {
        // Hapus hak user yang terkait
        await pool.query('DELETE FROM thakuser WHERE HAK_MEN_ID = ?', [req.params.id])
        // Hapus menu
        await pool.query('DELETE FROM tmenu WHERE MEN_ID = ?', [req.params.id])
        success(res, null, 'Item berhasil dihapus')
    } catch (err) {
        next(err)
    }
}

export const getMenuByUser = async (req, res, next) => {
    try {
        const { userKode } = req.params

        // Kalau user pusat, lihat semua menu aktif
        if (userKode.toLowerCase() === 'pusat') {
            const [parents] = await pool.query(
                `SELECT mp_id, mp_nama AS label, mp_icon AS icon, mp_order
         FROM tmenuparent 
         WHERE mp_aktif = 1 
         ORDER BY mp_order`
            )

            const menuTree = []
            for (const parent of parents) {
                const [items] = await pool.query(
                    `SELECT MEN_NAMA2 AS label, men_route AS \`to\`, men_icon AS icon 
           FROM tmenu 
           WHERE men_parent_id = ? 
           ORDER BY men_order`,
                    [parent.mp_id]
                )

                if (items.length > 0) {
                    menuTree.push({
                        label: parent.label,
                        icon: parent.icon,
                        items: items.map(item => ({
                            ...item,
                            tabTitle: item.label,
                            tabIcon: item.icon
                        }))
                    })
                }
            }

            return success(res, menuTree)
        }

        // User biasa: hanya menu yang ada di thakuser
        const [parents] = await pool.query(
            `SELECT DISTINCT
        mp.mp_id, mp.mp_nama AS label, mp.mp_icon AS icon, mp.mp_order
      FROM tmenu m
      JOIN thakuser h ON m.MEN_ID = h.HAK_MEN_ID
      JOIN tmenuparent mp ON m.men_parent_id = mp.mp_id
      WHERE h.HAK_USER_KODE = ? AND mp.mp_aktif = 1
      ORDER BY mp.mp_order`,
            [userKode]
        )

        const menuTree = []
        for (const parent of parents) {
            const [items] = await pool.query(
                `SELECT m.MEN_NAMA2 AS label, m.men_route AS \`to\`, m.men_icon AS icon 
         FROM tmenu m
         JOIN thakuser h ON m.MEN_ID = h.HAK_MEN_ID
         WHERE m.men_parent_id = ? AND h.HAK_USER_KODE = ?
         ORDER BY m.men_order`,
                [parent.mp_id, userKode]
            )

            if (items.length > 0) {
                menuTree.push({
                    label: parent.label,
                    icon: parent.icon,
                    items: items.map(item => ({
                        ...item,
                        tabTitle: item.label,
                        tabIcon: item.icon
                    }))
                })
            }
        }

        success(res, menuTree)

    } catch (err) {
        next(err)
    }
}