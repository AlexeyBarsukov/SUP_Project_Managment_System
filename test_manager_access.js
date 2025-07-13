const { Pool } = require('pg');
const pool = require('./src/db/connection');
const User = require('./src/db/models/User');

async function testManagerAccess() {
    console.log('🧪 Тестирование поэтапного доступа для менеджеров...\n');
    
    try {
        // 1. Создаем тестового менеджера с незаполненным профилем
        console.log('1️⃣ Создаем тестового менеджера...');
        const testManager = await User.create('999999999', 'test_manager', 'Тест', 'Менеджер', 'manager');
        console.log('✅ Менеджер создан:', testManager.first_name, testManager.last_name);
        
        // 2. Проверяем заполненность профиля
        console.log('\n2️⃣ Проверяем заполненность профиля...');
        const isComplete = await User.isManagerProfileFullyComplete('999999999');
        console.log('Профиль заполнен:', isComplete ? '✅ Да' : '❌ Нет');
        
        // 3. Проверяем базовую заполненность
        console.log('\n3️⃣ Проверяем базовую заполненность...');
        const isBasicComplete = await User.isManagerProfileComplete('999999999');
        console.log('Базовая заполненность:', isBasicComplete ? '✅ Да' : '❌ Нет');
        
        // 4. Заполняем профиль
        console.log('\n4️⃣ Заполняем профиль...');
        const profileData = {
            specialization: 'IT',
            experience: '3-5 лет',
            skills: ['Управление проектами', 'Agile', 'Scrum'],
            achievements: 'Успешно завершил 15+ проектов',
            salary_range: '150000-200000',
            contacts: '+7 (999) 123-45-67'
        };
        
        await User.updateManagerProfile('999999999', profileData);
        console.log('✅ Профиль обновлен');
        
        // 5. Проверяем заполненность после обновления
        console.log('\n5️⃣ Проверяем заполненность после обновления...');
        const isCompleteAfter = await User.isManagerProfileFullyComplete('999999999');
        console.log('Профиль заполнен:', isCompleteAfter ? '✅ Да' : '❌ Нет');
        
        // 6. Устанавливаем флаг завершения
        console.log('\n6️⃣ Устанавливаем флаг завершения...');
        await User.setManagerProfileCompleted('999999999');
        console.log('✅ Флаг завершения установлен');
        
        // 7. Финальная проверка
        console.log('\n7️⃣ Финальная проверка...');
        const finalCheck = await User.isManagerProfileFullyComplete('999999999');
        console.log('Профиль полностью заполнен:', finalCheck ? '✅ Да' : '❌ Нет');
        
        // 8. Получаем профиль для проверки
        console.log('\n8️⃣ Получаем профиль для проверки...');
        const profile = await User.getManagerProfile('999999999');
        console.log('Профиль:', JSON.stringify(profile, null, 2));
        
        console.log('\n🎉 Тестирование завершено успешно!');
        
    } catch (error) {
        console.error('❌ Ошибка при тестировании:', error.message);
    } finally {
        await pool.end();
    }
}

// Запускаем тест
testManagerAccess(); 