#!/usr/bin/env node

// Скрипт для тестирования подключения к базе данных
require('dotenv').config();
const { Pool } = require('pg');

async function testDatabaseConnection() {
    console.log('🔍 Тестирование подключения к базе данных...');
    
    // Проверяем переменные окружения
    console.log('\n📋 Переменные окружения:');
    console.log('NODE_ENV:', process.env.NODE_ENV);
    console.log('DB_URL:', process.env.DB_URL ? 'SET' : 'NOT SET');
    
    if (!process.env.DB_URL) {
        console.error('❌ DB_URL не установлен!');
        console.log('\n📋 Доступные переменные с DB/DATABASE/POSTGRES:');
        Object.keys(process.env)
            .filter(key => 
                key.includes('DB') || 
                key.includes('POSTGRES') || 
                key.includes('DATABASE')
            )
            .forEach(key => {
                const value = process.env[key];
                console.log(`  ${key}: ${value ? 'SET (' + value.substring(0, 30) + '...)' : 'NOT SET'}`);
            });
        process.exit(1);
    }
    
    // Проверяем формат URL
    console.log('\n🔍 Проверка формата DB_URL...');
    try {
        const url = new URL(process.env.DB_URL);
        console.log('✅ URL формат правильный');
        console.log('Protocol:', url.protocol);
        console.log('Host:', url.hostname);
        console.log('Port:', url.port || '5432 (default)');
        console.log('Database:', url.pathname.substring(1));
        console.log('Username:', url.username);
        console.log('Password:', url.password ? '***' : 'not set');
    } catch (error) {
        console.error('❌ Неправильный формат URL:', error.message);
        console.log('Пример правильного формата: postgres://user:password@host:port/database');
        process.exit(1);
    }
    
    // Тестируем подключение
    console.log('\n🔌 Тестирование подключения...');
    const pool = new Pool({
        connectionString: process.env.DB_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 30000,
    });
    
    try {
        const client = await pool.connect();
        console.log('✅ Подключение к базе данных успешно!');
        
        // Проверяем версию PostgreSQL
        const result = await client.query('SELECT version()');
        console.log('📊 Версия PostgreSQL:', result.rows[0].version.split(' ')[0]);
        
        // Проверяем доступные таблицы
        const tablesResult = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name
        `);
        
        console.log('📋 Доступные таблицы:');
        if (tablesResult.rows.length > 0) {
            tablesResult.rows.forEach(row => {
                console.log(`  - ${row.table_name}`);
            });
        } else {
            console.log('  (таблицы не найдены)');
        }
        
        client.release();
        await pool.end();
        
        console.log('\n🎉 Тест подключения к базе данных завершен успешно!');
        
    } catch (error) {
        console.error('❌ Ошибка подключения к базе данных:', error.message);
        console.error('Код ошибки:', error.code);
        
        if (error.code === 'ECONNREFUSED') {
            console.log('\n💡 Возможные причины:');
            console.log('- База данных не запущена');
            console.log('- Неправильный хост или порт');
            console.log('- Проблемы с сетью');
        } else if (error.code === '28P01') {
            console.log('\n💡 Возможные причины:');
            console.log('- Неправильное имя пользователя или пароль');
            console.log('- Пользователь не имеет прав доступа');
        } else if (error.code === '3D000') {
            console.log('\n💡 Возможные причины:');
            console.log('- База данных не существует');
            console.log('- Неправильное имя базы данных');
        }
        
        process.exit(1);
    }
}

// Запускаем тест если файл вызван напрямую
if (require.main === module) {
    testDatabaseConnection()
        .catch((error) => {
            console.error('❌ Критическая ошибка:', error);
            process.exit(1);
        });
}

module.exports = testDatabaseConnection;
