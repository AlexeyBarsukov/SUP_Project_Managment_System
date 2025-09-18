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
    
    try {
        const url = new URL(process.env.DB_URL);
        console.log('✅ DB_URL имеет правильный формат');
        console.log('Host:', url.hostname);
        console.log('Port:', url.port);
        console.log('Database:', url.pathname.substring(1));
    } catch (error) {
        console.error('❌ DB_URL имеет неправильный формат:', error.message);
        console.log('Пример правильного формата: postgres://user:password@host:port/database');
        process.exit(1);
    }

    const pool = new Pool({
        connectionString: process.env.DB_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
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
        process.exit(1);
    } finally {
        await pool.end();
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
