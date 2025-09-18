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
        process.exit(1);
    }

    const pool = new Pool({
        connectionString: process.env.DB_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });

    try {
        // Проверяем подключение
        console.log('🔍 Проверка подключения к базе данных...');
        await pool.query('SELECT 1');
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
