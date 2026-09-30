import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import routes from './src/routes.js'  // ← Cukup 1 file
import { errorHandler } from './src/middleware/errorHandler.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 4002

// Middleware
app.use(cors())
app.use(express.json({ limit: '25mb' }))
app.use(express.urlencoded({ limit: '25mb', extended: true }))

// Logger
app.use((req, res, next) => {
    const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ')
    console.log(`[${timestamp}] ${req.method} ${req.url}`)
    next()
})

// Routes (semua di 1 file)
app.use('/api', routes)

// Health check
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'BSM HRIS API',
        version: '1.0.0'
    })
})

// 404
app.use((req, res) => {
    res.status(404).json({ success: false, message: 'Route tidak ditemukan' })
})

// Error handler
app.use(errorHandler)

app.listen(PORT, () => {
    console.log('')
    console.log('╔══════════════════════════════════════╗')
    console.log(`║   🚀 Server running on port ${PORT}      ║`)
    console.log(`║   🌐 http://localhost:${PORT}             ║`)
    console.log('╚══════════════════════════════════════╝')
    console.log('')
})