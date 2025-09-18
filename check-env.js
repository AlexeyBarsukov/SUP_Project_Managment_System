#!/usr/bin/env node

// Скрипт для проверки переменных окружения
require('dotenv').config();

console.log('🔍 Проверка переменных окружения:');
console.log('================================');

const requiredVars = [
    'TELEGRAM_TOKEN',
    'ADMIN_ID',
    'NODE_ENV'
];

const optionalVars = [
    'DB_URL',
    'REDIS_URL',
    'PORT'
];

let allGood = true;

console.log('\n📋 Обязательные переменные:');
requiredVars.forEach(varName => {
    const value = process.env[varName];
    if (value) {
        if (varName === 'TELEGRAM_TOKEN') {
            console.log(`✅ ${varName}: SET (length: ${value.length})`);
        } else {
            console.log(`✅ ${varName}: ${value}`);
        }
    } else {
        console.log(`❌ ${varName}: NOT SET`);
        allGood = false;
    }
});

console.log('\n📋 Опциональные переменные:');
optionalVars.forEach(varName => {
    const value = process.env[varName];
    if (value) {
        console.log(`✅ ${varName}: ${value}`);
    } else {
        console.log(`⚠️  ${varName}: NOT SET (optional)`);
    }
});

console.log('\n' + '='.repeat(50));
if (allGood) {
    console.log('🎉 Все обязательные переменные установлены!');
    process.exit(0);
} else {
    console.log('❌ Некоторые обязательные переменные не установлены!');
    console.log('\n💡 Для локального запуска создайте файл .env:');
    console.log('TELEGRAM_TOKEN=your_bot_token_here');
    console.log('ADMIN_ID=your_telegram_id_here');
    console.log('NODE_ENV=development');
    process.exit(1);
}
