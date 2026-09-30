/**
 * Response sukses
 */
export const success = (res, data = null, message = 'Success', statusCode = 200) => {
    return res.status(statusCode).json({ success: true, message, data })
}

/**
 * Response error
 */
export const error = (res, message = 'Internal Server Error', statusCode = 500) => {
    return res.status(statusCode).json({ success: false, message })
}

/**
 * Response dengan pagination
 */
export const paginated = (res, data, pagination, message = 'Success') => {
    return res.status(200).json({ success: true, message, data, pagination })
}