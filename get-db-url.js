#!/usr/bin/env node

// Скрипт для получения DB_URL из переменных окружения Render
require('dotenv').config();

console.log('🔍 Поиск DB_URL в переменных окружения...');

// Проверяем различные варианты переменных DB_URL
const possibleDbVars = [
    'DB_URL',
    'DATABASE_URL', 
    'POSTGRES_URL',
    'POSTGRESQL_URL',
    'RENDER_DATABASE_URL'
];

let dbUrl = null;

for (const varName of possibleDbVars) {
    const value = process.env[varName];
    if (value) {
        console.log(`✅ Найден ${varName}: ${value.substring(0, 20)}...`);
        dbUrl = value;
        break;
    }
}

if (!dbUrl) {
    console.log('❌ DB_URL не найден в переменных окружения');
    console.log('📋 Доступные переменные:');
    Object.keys(process.env)
        .filter(key => key.includes('DB') || key.includes('POSTGRES') || key.includes('DATABASE'))
        .forEach(key => {
            console.log(`  ${key}: ${process.env[key] ? 'SET' : 'NOT SET'}`);
        });
    process.exit(1);
}

console.log('✅ DB_URL найден и готов к использованию');
process.exit(0);

