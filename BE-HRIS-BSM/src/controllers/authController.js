import jwt from 'jsonwebtoken'
import pool from '../config/database.js'
import { success, error } from '../helpers/response.js'

export const login = async (req, res, next) => {
    try {
        const { username, password } = req.body

        if (!username || !password) {
            return error(res, 'Username dan password wajib diisi', 400)
        }

        const [users] = await pool.query(
            `SELECT u.user, u.kd_unit, u.passw, u.kar_nik, t.nm_unit 
       FROM tuser u 
       LEFT JOIN tunit t ON u.kd_unit = t.kd_unit 
       WHERE UPPER(u.user) = ?`,
            [username.toUpperCase()]
        )

        if (users.length === 0) {
            return error(res, 'Username atau password salah', 401)
        }

        const user = users[0]

        if (user.passw !== password) {
            return error(res, 'Username atau password salah', 401)
        }

        const isPusat = user.user.toLowerCase() === 'pusat'

        const tokenPayload = {
            user: user.user,
            kd_unit: isPusat ? '%' : String(user.kd_unit),
            kar_nik: user.kar_nik || '',
            nm_unit: user.nm_unit || 'Pusat'
        }

        const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
            expiresIn: process.env.JWT_EXPIRES_IN || '1h'
        })

        const refreshToken = jwt.sign(tokenPayload, process.env.JWT_REFRESH_SECRET, {
            expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d'
        })

        success(res, {
            user: {
                user: user.user,
                kd_unit: user.kd_unit,
                kar_nik: user.kar_nik || '',
                nm_unit: user.nm_unit || 'Pusat',
                is_pusat: isPusat
            },
            token,
            refresh_token: refreshToken,
            token_expiry: process.env.JWT_EXPIRES_IN || '1h'
        }, 'Login berhasil')

    } catch (err) {
        next(err)
    }
}

export const refresh = async (req, res, next) => {
    try {
        const refreshToken = req.headers['x-refresh-token']

        if (!refreshToken) {
            return error(res, 'Refresh token diperlukan', 401)
        }

        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET)

        const tokenPayload = {
            user: decoded.user,
            kd_unit: decoded.kd_unit,
            kar_nik: decoded.kar_nik,
            nm_unit: decoded.nm_unit
        }

        const newToken = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
            expiresIn: process.env.JWT_EXPIRES_IN || '1h'
        })

        success(res, { token: newToken }, 'Token refreshed')

    } catch (err) {
        return error(res, 'Refresh token tidak valid atau expired', 401)
    }
}

export const logout = async (req, res, next) => {
    success(res, null, 'Logout berhasil')
}