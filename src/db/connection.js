const { Pool } = require('pg');
require('dotenv').config();

// Отладочная информация для подключения к БД
console.log('🔍 Database connection info:');
console.log('DB_URL:', process.env.DB_URL ? 'SET' : 'NOT SET');
console.log('NODE_ENV:', process.env.NODE_ENV);

if (!process.env.DB_URL) {
    console.error('❌ DB_URL is not set! Please check your environment variables.');
    process.exit(1);
}

const pool = new Pool({
    connectionString: process.env.DB_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Обработка ошибок подключения
pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
    process.exit(-1);
});

// Тест подключения
pool.on('connect', () => {
    console.log('Connected to PostgreSQL database');
});

module.exports = pool; 