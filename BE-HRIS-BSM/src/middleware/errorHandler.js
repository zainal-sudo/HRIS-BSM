export const errorHandler = (err, req, res, next) => {
    console.error('❌ ERROR:', err.message)

    // MySQL Error
    if (err.code === 'ER_DUP_ENTRY') {
        // Sertakan detail entry agar ketahuan kolom mana yang duplikat
        // cth: "Duplicate entry '123' for key 'PRIMARY'"
        const detail = err.sqlMessage ? `: ${err.sqlMessage}` : ''
        return res.status(409).json({ success: false, message: `Data sudah ada (duplikat)${detail}` })
    }

    if (err.code === 'ER_NO_REFERENCED_ROW_2') {
        return res.status(400).json({ success: false, message: 'Referensi data tidak valid' })
    }

    const statusCode = err.statusCode || 500
    const message = err.message || 'Internal Server Error'

    res.status(statusCode).json({
        success: false,
        message,
    })
}