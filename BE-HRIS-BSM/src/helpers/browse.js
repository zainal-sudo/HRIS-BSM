/**
 * Helper browse: sorting + filter per kolom (server-side).
 *
 * Dipakai semua endpoint browse agar header tabel bisa di-sort
 * (klik header) dan di-filter per kolom.
 *
 * Keamanan: nama kolom TIDAK pernah diambil mentah dari query —
 * harus ada di whitelist `allowedMap` (alias frontend -> kolom SQL).
 * Key yang tidak dikenal diabaikan.
 */

/**
 * Bangun klausa ORDER BY dari query `sort_by` / `sort_dir`.
 * @param {object} query req.query
 * @param {Record<string,string>} allowedMap alias -> ekspresi kolom SQL
 * @param {string} defaultOrder ORDER BY bawaan bila sort_by tidak valid
 * @returns {string} mis. "ORDER BY `Nama` ASC"
 */
export function buildOrderBy(query, allowedMap, defaultOrder) {
    const sortBy = query?.sort_by
    let dir = String(query?.sort_dir || '').toLowerCase()
    if (dir !== 'asc' && dir !== 'desc') dir = ''
    const col = sortBy ? allowedMap[sortBy] : null
    if (col && dir) {
        return `ORDER BY ${col} ${dir.toUpperCase()}`
    }
    return defaultOrder
}

/**
 * Terapkan filter per kolom dari query `filter_<Alias>`.
 * @param {string} whereClause klausa WHERE yang sudah ada
 * @param {Array} params parameter yang sudah ada (dikopi, tidak dimutasi)
 * @param {object} query req.query
 * @param {Record<string,string>} allowedMap alias -> ekspresi kolom SQL
 * @param {string} [except] alias yang dikecualikan (untuk daftar distinct)
 * @returns {{ clause: string, params: Array }}
 */
export function applyColumnFilters(whereClause, params, query, allowedMap, except = null) {
    let clause = whereClause
    const out = [...params]
    if (!query) return { clause, params: out }
    for (const [alias, col] of Object.entries(allowedMap)) {
        if (alias === except) continue
        const raw = query[`filter_${alias}`]
        if (raw === undefined || raw === null) continue
        const v = String(raw).trim()
        if (!v) continue
        clause += ` AND ${col} LIKE ?`
        out.push(`%${v}%`)
    }
    return { clause, params: out }
}

/**
 * Terapkan filter checklist per kolom dari query `filterSet_<Alias>`.
 * Nilai dikirim berulang (filterSet_Nama=a&filterSet_Nama=b) -> operator IN.
 * Axios mengirim array sebagai `filterSet_Nama[]=a`, keduanya didukung.
 * @param {string} [except] alias yang dikecualikan (untuk daftar distinct)
 * @returns {{ clause: string, params: Array }}
 */
export function applyColumnFilterSets(whereClause, params, query, allowedMap, except = null) {
    let clause = whereClause
    const out = [...params]
    if (!query) return { clause, params: out }
    for (const [alias, col] of Object.entries(allowedMap)) {
        if (alias === except) continue
        let raw = query[`filterSet_${alias}`]
        if (raw === undefined) raw = query[`filterSet_${alias}[]`]
        if (raw === undefined || raw === null) continue
        const arr = (Array.isArray(raw) ? raw : [raw])
            .map((v) => String(v).trim())
            .filter((v) => v !== '')
        if (arr.length === 0) continue
        clause += ` AND ${col} IN (${arr.map(() => '?').join(',')})`
        out.push(...arr)
    }
    return { clause, params: out }
}

/**
 * Terapkan SEMUA filter kolom (teks LIKE + checklist IN) sekaligus.
 * @returns {{ clause: string, params: Array }}
 */
export function applyAllColumnFilters(whereClause, params, query, allowedMap, except = null) {
    const f1 = applyColumnFilters(whereClause, params, query, allowedMap, except)
    return applyColumnFilterSets(f1.clause, f1.params, query, allowedMap, except)
}
