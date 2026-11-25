import jwt from 'jsonwebtoken'

export const verifyToken = (req, res, next) => {
    const authHeader = req.headers.authorization

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: 'Token tidak ditemukan' })
    }

    const token = authHeader.split(' ')[1]

    try {
        // ignoreExpiration: token lama yang sudah punya exp tetap diterima,
        // karena masa berlaku token tidak dipakai lagi.
        const decoded = jwt.verify(token, process.env.JWT_SECRET, { ignoreExpiration: true })
        req.user = decoded  // { user, kd_unit, kar_nik, nm_unit }
        next()
    } catch (err) {
        return res.status(401).json({ success: false, message: 'Token tidak valid' })
    }
}