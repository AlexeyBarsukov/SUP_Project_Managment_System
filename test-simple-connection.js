#!/usr/bin/env node

// Простой тест подключения к базе данных без использования Pool
require('dotenv').config();
const { Client } = require('pg');

async function testSimpleConnection() {
    console.log('🔍 Простой тест подключения к базе данных...');
    
    if (!process.env.DB_URL) {
        console.error('❌ DB_URL не установлен!');
        process.exit(1);
    }
    
    console.log('DB_URL:', process.env.DB_URL.substring(0, 30) + '...');
    
    // Попробуем разные способы подключения
    const connectionMethods = [
        {
            name: 'С connectionString',
            config: {
                connectionString: process.env.DB_URL,
                ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
            }
        },
        {
            name: 'С разобранными параметрами',
            config: (() => {
                try {
                    const url = new URL(process.env.DB_URL);
                    return {
                        host: url.hostname,
                        port: url.port || 5432,
                        database: url.pathname.substring(1),
                        user: url.username,
                        password: url.password,
                        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
                    };
                } catch (error) {
                    console.log('⚠️ Не удалось разобрать URL для параметрического подключения');
                    return null;
                }
            })()
        }
    ];
    
    for (const method of connectionMethods) {
        if (!method.config) continue;
        
        console.log(`\n🔧 Тестируем: ${method.name}`);
        
        const client = new Client(method.config);
        
        try {
            await client.connect();
            console.log('✅ Подключение успешно!');
            
            const result = await client.query('SELECT version()');
            console.log('📊 Версия PostgreSQL:', result.rows[0].version.split(' ')[0]);
            
            await client.end();
            console.log('✅ Тест завершен успешно');
            return;
            
        } catch (error) {
            console.log('❌ Ошибка:', error.message);
            console.log('Код ошибки:', error.code);
            
            if (error.message.includes('searchParams')) {
                console.log('🔍 Обнаружена ошибка searchParams - попробуем следующий метод');
            }
        }
    }
    
    console.log('\n❌ Все методы подключения не сработали');
    console.log('\n💡 Рекомендации:');
    console.log('1. Проверьте правильность DB_URL');
    console.log('2. Убедитесь, что база данных доступна');
    console.log('3. Проверьте настройки SSL');
    console.log('4. Возможно, в пароле есть специальные символы');
    
    process.exit(1);
}

// Запускаем тест если файл вызван напрямую
if (require.main === module) {
    testSimpleConnection()
        .catch((error) => {
            console.error('❌ Критическая ошибка:', error);
            process.exit(1);
        });
}

module.exports = testSimpleConnection;
