// config.js
module.exports = {
    // API keys and tokens
    BITLY_ACCESS_TOKEN: process.env.BITLY_ACCESS_TOKEN || '',

    // Server configuration
    PORT: process.env.PORT || 5000,

    // File storage
    TEMP_DIR: './temp',

    // Timeouts and limits
    REQUEST_TIMEOUT: 60000, // 60 seconds
    MAX_FILE_SIZE: 1024 * 1024 * 100, // 100MB

    // Debug mode
    DEBUG: process.env.DEBUG || false
};