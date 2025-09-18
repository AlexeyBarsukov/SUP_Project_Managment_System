#!/usr/bin/env node

// Скрипт для диагностики проблем с DB_URL
require('dotenv').config();

console.log('🔍 Диагностика DB_URL...');
console.log('========================');

// Показываем все переменные окружения
console.log('\n📋 Все переменные окружения:');
Object.keys(process.env)
    .sort()
    .forEach(key => {
        const value = process.env[key];
        if (key.includes('DB') || key.includes('POSTGRES') || key.includes('DATABASE')) {
            console.log(`🔴 ${key}: ${value ? value.substring(0, 50) + '...' : 'NOT SET'}`);
        } else {
            console.log(`⚪ ${key}: ${value ? 'SET' : 'NOT SET'}`);
        }
    });

// Проверяем DB_URL
console.log('\n🔍 Анализ DB_URL:');
if (!process.env.DB_URL) {
    console.log('❌ DB_URL не установлен');
    process.exit(1);
}

const dbUrl = process.env.DB_URL;
console.log('📏 Длина DB_URL:', dbUrl.length);
console.log('🔤 Первые 50 символов:', dbUrl.substring(0, 50));
console.log('🔤 Последние 20 символов:', dbUrl.substring(dbUrl.length - 20));

// Проверяем формат
console.log('\n🔍 Проверка формата:');
console.log('Начинается с postgres://:', dbUrl.startsWith('postgres://'));
console.log('Начинается с postgresql://:', dbUrl.startsWith('postgresql://'));

// Попробуем парсить URL
console.log('\n🔍 Попытка парсинга URL:');
try {
    const url = new URL(dbUrl);
    console.log('✅ URL успешно распарсен');
    console.log('Protocol:', url.protocol);
    console.log('Hostname:', url.hostname);
    console.log('Port:', url.port || '5432 (default)');
    console.log('Pathname:', url.pathname);
    console.log('Username:', url.username);
    console.log('Password:', url.password ? '***' : 'not set');
    
    // Проверяем компоненты
    if (!url.hostname) {
        console.log('⚠️ Hostname отсутствует');
    }
    if (!url.pathname || url.pathname === '/') {
        console.log('⚠️ Database name отсутствует');
    }
    if (!url.username) {
        console.log('⚠️ Username отсутствует');
    }
    if (!url.password) {
        console.log('⚠️ Password отсутствует');
    }
    
} catch (error) {
    console.log('❌ Ошибка парсинга URL:', error.message);
    
    // Попробуем найти проблемы
    console.log('\n🔍 Поиск проблем:');
    
    if (!dbUrl.includes('://')) {
        console.log('❌ Отсутствует протокол (://)');
    }
    
    if (!dbUrl.includes('@')) {
        console.log('❌ Отсутствует разделитель @ между credentials и host');
    }
    
    if (!dbUrl.includes('/')) {
        console.log('❌ Отсутствует разделитель / для database name');
    }
    
    // Попробуем исправить URL
    console.log('\n🔧 Попытка исправления:');
    let fixedUrl = dbUrl;
    
    // Добавляем протокол если отсутствует
    if (!fixedUrl.includes('://')) {
        fixedUrl = 'postgres://' + fixedUrl;
        console.log('✅ Добавлен протокол postgres://');
    }
    
    // Проверяем исправленный URL
    try {
        const testUrl = new URL(fixedUrl);
        console.log('✅ Исправленный URL валиден');
        console.log('Исправленный URL:', fixedUrl);
    } catch (fixError) {
        console.log('❌ Исправленный URL все еще невалиден:', fixError.message);
    }
}

console.log('\n📋 Рекомендации:');
console.log('1. Убедитесь, что скопировали полный URL из Render Dashboard');
console.log('2. Проверьте, что в URL нет лишних пробелов');
console.log('3. URL должен начинаться с postgres://');
console.log('4. Формат: postgres://username:password@host:port/database');

console.log('\n🎯 Пример правильного DB_URL:');
console.log('postgres://user:password@dpg-xxxxx-a.oregon-postgres.render.com:5432/database_name');
