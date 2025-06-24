const pool = require('./src/db/connection');
const User = require('./src/db/models/User');

async function testProfileSkipBehavior() {
    try {
        console.log('=== ТЕСТ ПОВЕДЕНИЯ ПРИ ПРОПУСКЕ ПОЛЕЙ ПРОФИЛЯ ===\n');
        
        // Получаем тестового менеджера
        const managers = await User.findVisibleByRole('manager');
        if (managers.length === 0) {
            console.log('❌ Нет менеджеров для тестирования');
            return;
        }
        
        const testManager = managers[0];
        console.log(`👤 Тестируем на менеджере: @${testManager.username}`);
        
        // Проверяем текущие данные профиля
        console.log('\n📋 Текущий профиль:');
        console.log(`- Специализация: ${testManager.specialization || 'не указана'}`);
        console.log(`- Опыт: ${testManager.experience || 'не указан'}`);
        console.log(`- Навыки: ${testManager.skills || 'не указаны'}`);
        console.log(`- Достижения: ${testManager.achievements || 'не указаны'}`);
        console.log(`- Зарплата: ${testManager.salary_range || 'не указана'}`);
        console.log(`- Контакты: ${testManager.contacts || 'не указаны'}`);
        
        // Симулируем данные профиля для тестирования
        const testProfileData = {
            specialization: 'IT-проекты',
            experience: '3-5 лет',
            skills: ['Jira', 'Scrum', 'Python'],
            achievements: undefined, // изначально не обработано
            salary_range: undefined, // изначально не обработано
            contacts: undefined // изначально не обработано
        };
        
        console.log('\n🧪 Симулируем заполнение профиля с пропусками:');
        console.log('1. Специализация: ✅ заполнена');
        console.log('2. Опыт: ✅ заполнен');
        console.log('3. Навыки: ✅ заполнены');
        console.log('4. Достижения: ⏭️ будет пропущено');
        console.log('5. Зарплата: ⏭️ будет пропущено');
        console.log('6. Контакты: ⏭️ будет пропущено');
        
        // Проверяем логику защиты от дублирования
        console.log('\n🔍 Проверка логики защиты от дублирования:');
        
        // Тест 1: Достижения
        console.log('\n1️⃣ Тест достижений:');
        if (testProfileData.achievements !== undefined) {
            console.log('✅ Достижения уже обработаны, переход к зарплате');
        } else {
            console.log('❌ Достижения не обработаны, показываем вопрос');
        }
        
        // Симулируем пропуск достижений
        testProfileData.achievements = null;
        console.log('   После пропуска:');
        if (testProfileData.achievements !== undefined) {
            console.log('✅ Достижения обработаны (пропущены), переход к зарплате');
        } else {
            console.log('❌ Достижения не обработаны');
        }
        
        // Тест 2: Зарплата
        console.log('\n2️⃣ Тест зарплаты:');
        if (testProfileData.salary_range !== undefined) {
            console.log('✅ Зарплата уже обработана, переход к контактам');
        } else {
            console.log('❌ Зарплата не обработана, показываем вопрос');
        }
        
        // Симулируем пропуск зарплаты
        testProfileData.salary_range = null;
        console.log('   После пропуска:');
        if (testProfileData.salary_range !== undefined) {
            console.log('✅ Зарплата обработана (пропущена), переход к контактам');
        } else {
            console.log('❌ Зарплата не обработана');
        }
        
        // Тест 3: Контакты
        console.log('\n3️⃣ Тест контактов:');
        if (testProfileData.contacts !== undefined) {
            console.log('✅ Контакты уже обработаны, сохранение профиля');
        } else {
            console.log('❌ Контакты не обработаны, показываем вопрос');
        }
        
        // Симулируем пропуск контактов
        testProfileData.contacts = null;
        console.log('   После пропуска:');
        if (testProfileData.contacts !== undefined) {
            console.log('✅ Контакты обработаны (пропущены), сохранение профиля');
        } else {
            console.log('❌ Контакты не обработаны');
        }
        
        console.log('\n✅ ВСЕ ТЕСТЫ ЗАВЕРШЕНЫ');
        console.log('\n📝 Ожидаемое поведение:');
        console.log('- При пропуске поля устанавливается в null');
        console.log('- Поле помечается как обработанное (не undefined)');
        console.log('- Происходит переход к следующему шагу');
        console.log('- Вопрос больше не дублируется');
        
    } catch (error) {
        console.error('❌ Ошибка при тестировании:', error);
    } finally {
        await pool.end();
    }
}

// Запускаем тест
testProfileSkipBehavior(); 