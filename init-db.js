#!/usr/bin/env node

// Скрипт для инициализации базы данных
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function initializeDatabase() {
    console.log('🗄️ Инициализация базы данных...');
    
    if (!process.env.DB_URL) {
        console.error('❌ DB_URL не установлен!');
        console.log('📋 Доступные переменные окружения:');
        Object.keys(process.env)
            .filter(key => key.includes('DB') || key.includes('POSTGRES') || key.includes('DATABASE'))
            .forEach(key => {
                console.log(`  ${key}: ${process.env[key] ? 'SET' : 'NOT SET'}`);
            });
        process.exit(1);
    }

    // Проверяем формат DB_URL
    console.log('🔍 Проверка формата DB_URL...');
    console.log('DB_URL:', process.env.DB_URL.substring(0, 20) + '...');
    
    // Более гибкая проверка URL
    let isValidUrl = false;
    let urlInfo = {};
    
    try {
        const url = new URL(process.env.DB_URL);
        isValidUrl = true;
        urlInfo = {
            protocol: url.protocol,
            hostname: url.hostname,
            port: url.port,
            database: url.pathname.substring(1),
            username: url.username,
            password: url.password ? '***' : 'not set'
        };
    } catch (error) {
        // Попробуем альтернативные форматы
        console.log('⚠️ Стандартный URL парсер не сработал, пробуем альтернативные форматы...');
        
        // Проверяем, начинается ли с postgres://
        if (process.env.DB_URL.startsWith('postgres://')) {
            console.log('✅ URL начинается с postgres://');
            isValidUrl = true;
            urlInfo = { protocol: 'postgres:', note: 'формат принят без детального парсинга' };
        } else {
            console.error('❌ DB_URL не начинается с postgres://');
            console.log('Полный DB_URL:', process.env.DB_URL);
            console.log('Пример правильного формата: postgres://user:password@host:port/database');
            process.exit(1);
        }
    }
    
    if (isValidUrl) {
        console.log('✅ DB_URL принят для использования');
        if (urlInfo.hostname) {
            console.log('Host:', urlInfo.hostname);
            console.log('Port:', urlInfo.port || '5432 (default)');
            console.log('Database:', urlInfo.database);
            console.log('Username:', urlInfo.username);
            console.log('Password:', urlInfo.password);
        }
    }

    // Создаем пул с более детальной конфигурацией
    const poolConfig = {
        connectionString: process.env.DB_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
        query_timeout: 10000,
        statement_timeout: 10000,
    };
    
    console.log('🔧 Конфигурация подключения:');
    console.log('SSL:', poolConfig.ssl ? 'enabled' : 'disabled');
    console.log('Max connections:', poolConfig.max);
    console.log('Connection timeout:', poolConfig.connectionTimeoutMillis + 'ms');
    
    const pool = new Pool(poolConfig);
    
    // Обработка ошибок пула
    pool.on('error', (err) => {
        console.error('❌ Ошибка пула подключений:', err.message);
        console.error('Код ошибки:', err.code);
    });
    
    pool.on('connect', () => {
        console.log('✅ Новое подключение к базе данных установлено');
    });

    try {
        // Проверяем подключение
        console.log('🔍 Проверка подключения к базе данных...');
        const client = await pool.connect();
        await client.query('SELECT 1');
        client.release();
        console.log('✅ Подключение к базе данных успешно');

        // Выполняем миграции
        console.log('📝 Выполнение миграций...');
        const migrationDir = path.join(__dirname, 'db');
        
        if (!fs.existsSync(migrationDir)) {
            console.log('⚠️ Папка миграций не найдена');
            return;
        }

        const files = fs.readdirSync(migrationDir)
            .filter(file => file.endsWith('.sql'))
            .sort();

        for (const file of files) {
            console.log(`📄 Выполняем миграцию: ${file}`);
            const sql = fs.readFileSync(path.join(migrationDir, file), 'utf8');
            try {
                await pool.query(sql);
                console.log(`✅ Миграция ${file} выполнена успешно`);
            } catch (error) {
                if (error.message.includes('already exists') || error.message.includes('уже существует')) {
                    console.log(`⚠️ Миграция ${file} уже выполнена, пропускаем`);
                } else {
                    throw error;
                }
            }
        }

        console.log('✅ Все миграции выполнены успешно');

        // Проверяем созданные таблицы
        console.log('📊 Проверка созданных таблиц...');
        const result = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name
        `);
        
        console.log('📋 Созданные таблицы:');
        result.rows.forEach(row => {
            console.log(`  - ${row.table_name}`);
        });

    } catch (error) {
        console.error('❌ Ошибка при инициализации базы данных:', error.message);
        console.error('Код ошибки:', error.code);
        console.error('Детали ошибки:', error);
        
        // Дополнительная диагностика
        if (error.code === 'ECONNREFUSED') {
            console.log('\n💡 Возможные причины ECONNREFUSED:');
            console.log('- База данных не запущена');
            console.log('- Неправильный хост или порт');
            console.log('- Проблемы с сетью');
        } else if (error.code === '28P01') {
            console.log('\n💡 Возможные причины 28P01 (authentication failed):');
            console.log('- Неправильное имя пользователя или пароль');
            console.log('- Пользователь не имеет прав доступа');
        } else if (error.code === '3D000') {
            console.log('\n💡 Возможные причины 3D000 (database does not exist):');
            console.log('- База данных не существует');
            console.log('- Неправильное имя базы данных');
        } else if (error.message.includes('searchParams')) {
            console.log('\n💡 Возможные причины ошибки searchParams:');
            console.log('- Неправильный формат URL');
            console.log('- Проблемы с парсингом connection string');
            console.log('- Специальные символы в пароле');
        }
        
        process.exit(1);
    } finally {
        try {
            await pool.end();
        } catch (endError) {
            console.error('Ошибка при закрытии пула:', endError.message);
        }
    }
}

// Запускаем инициализацию если файл вызван напрямую
if (require.main === module) {
    initializeDatabase()
        .then(() => {
            console.log('🎉 Инициализация базы данных завершена!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Критическая ошибка:', error);
            process.exit(1);
        });
}

module.exports = initializeDatabase;
