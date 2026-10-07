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
 * Bangun klausa filter rentang tanggal untuk kolom tanggal/datetime.
 *
 * PENTING: memakai batas setengah terbuka `>= start AND < end + 1 hari`,
 * bukan `BETWEEN start AND end`. Kalau kolomnya bertipe DATETIME (mis.
 * tijin.tanggal, tkeluar.kl_tanggal, tpkwt.pkwt_tanggal) dan user memilih
 * rentang "1 s/d 6 Oktober", `BETWEEN '2026-10-01' AND '2026-10-06'`
 * sebenarnya berarti sampai '2026-10-06 00:00:00', sehingga transaksi
 * tanggal 6 yang jamnya > 00:00 ikut terbuang. Dengan `< end + 1 hari`,
 * seluruh transaksi di tanggal terakhir tetap muncul.
 *
 * Aman untuk kolom DATE maupun DATETIME.
 *
 * @param {string} col ekspresi kolom SQL (dari whitelist, bukan input user)
 * @param {string|null} startDate 'YYYY-MM-DD' atau null
 * @param {string|null} endDate 'YYYY-MM-DD' atau null
 * @returns {{ clause: string, params: Array }}
 */
export function dateRangeClause(col, startDate, endDate) {
    let clause = ''
    const params = []
    if (startDate) {
        clause += ` AND ${col} >= ?`
        params.push(startDate)
    }
    if (endDate) {
        clause += ` AND ${col} < DATE_ADD(?, INTERVAL 1 DAY)`
        params.push(endDate)
    }
    return { clause, params }
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
