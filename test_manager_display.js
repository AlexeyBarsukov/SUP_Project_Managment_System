const pool = require('./src/db/connection');
const User = require('./src/db/models/User');

async function testAllManagerDisplays() {
    try {
        console.log('=== ТЕСТ ОТОБРАЖЕНИЯ МЕНЕДЖЕРОВ ВО ВСЕХ МЕСТАХ ===\n');
        
        // Получаем всех видимых менеджеров
        const managers = await User.findVisibleByRole('manager');
        console.log(`📊 Найдено менеджеров: ${managers.length}\n`);
        
        for (const m of managers) {
            console.log(`👨‍💼 МЕНЕДЖЕР: @${m.username}`);
            console.log(`   Имя: ${m.first_name || ''} ${m.last_name || ''}`);
            console.log(`   Специализация: ${m.specialization || 'не указана'}`);
            console.log(`   Опыт: ${m.experience || 'не указан'}`);
            console.log(`   Навыки: ${m.skills || 'не указаны'}`);
            console.log(`   💸 Зарплата: ${m.salary_range || 'не указана'}`);
            console.log(`   📞 Контакты: ${m.contacts || 'не указаны'}`);
            console.log(`   Достижения: ${m.achievements || 'не указаны'}`);
            console.log('');
        }
        
        // Тестируем форматирование для разных сценариев
        console.log('=== ФОРМАТИРОВАНИЕ ДЛЯ РАЗНЫХ СЦЕНАРИЕВ ===\n');
        
        // 1. Выбор основного менеджера
        console.log('1️⃣ ВЫБОР ОСНОВНОГО МЕНЕДЖЕРА:');
        let list1 = '👨‍💼 <b>Выберите менеджера:</b>\n\n';
        for (const m of managers) {
            let desc = [];
            if (m.specialization) desc.push(m.specialization);
            if (m.experience) desc.push(m.experience);
            if (m.skills) {
                let skills = m.skills;
                if (typeof skills === 'string') {
                    try {
                        const arr = JSON.parse(skills);
                        if (Array.isArray(arr)) skills = arr.join(', ');
                    } catch { /* ignore */ }
                }
                desc.push(`Навыки: ${skills}`);
            }
            list1 += `• @${m.username} — ${m.first_name || ''} ${m.last_name || ''}`;
            if (desc.length) list1 += `\n   ${desc.join(' | ')}`;
            
            let additionalInfo = [];
            if (m.salary_range) additionalInfo.push(`💸 Зарплата: ${m.salary_range}`);
            if (m.contacts) additionalInfo.push(`📞 Контакты: ${m.contacts}`);
            
            if (additionalInfo.length > 0) {
                list1 += `\n   ${additionalInfo.join(' | ')}`;
            }
            
            list1 += '\n';
        }
        console.log(list1);
        
        // 2. Добавление дополнительного менеджера
        console.log('2️⃣ ДОБАВЛЕНИЕ ДОПОЛНИТЕЛЬНОГО МЕНЕДЖЕРА:');
        let list2 = '➕ <b>Выберите дополнительного менеджера:</b>\n\n';
        for (const m of managers) {
            let desc = [];
            if (m.specialization) desc.push(m.specialization);
            if (m.experience) desc.push(m.experience);
            if (m.skills) {
                let skills = m.skills;
                if (typeof skills === 'string') {
                    try {
                        const arr = JSON.parse(skills);
                        if (Array.isArray(arr)) skills = arr.join(', ');
                    } catch { /* ignore */ }
                }
                desc.push(`Навыки: ${skills}`);
            }
            list2 += `• @${m.username} — ${m.first_name || ''} ${m.last_name || ''}`;
            if (desc.length) list2 += `\n   ${desc.join(' | ')}`;
            
            let additionalInfo = [];
            if (m.salary_range) additionalInfo.push(`💸 Зарплата: ${m.salary_range}`);
            if (m.contacts) additionalInfo.push(`📞 Контакты: ${m.contacts}`);
            
            if (additionalInfo.length > 0) {
                list2 += `\n   ${additionalInfo.join(' | ')}`;
            }
            
            list2 += '\n';
        }
        console.log(list2);
        
        // 3. Смена менеджера
        console.log('3️⃣ СМЕНА МЕНЕДЖЕРА:');
        let list3 = `🔄 <b>Выберите нового менеджера для замены @old_manager:</b>\n\n`;
        for (const m of managers) {
            let desc = [];
            if (m.specialization) desc.push(m.specialization);
            if (m.experience) desc.push(m.experience);
            if (m.skills) {
                let skills = m.skills;
                if (typeof skills === 'string') {
                    try {
                        const arr = JSON.parse(skills);
                        if (Array.isArray(arr)) skills = arr.join(', ');
                    } catch { /* ignore */ }
                }
                desc.push(`Навыки: ${skills}`);
            }
            list3 += `• @${m.username} — ${m.first_name || ''} ${m.last_name || ''}`;
            if (desc.length) list3 += `\n   ${desc.join(' | ')}`;
            
            let additionalInfo = [];
            if (m.salary_range) additionalInfo.push(`💸 Зарплата: ${m.salary_range}`);
            if (m.contacts) additionalInfo.push(`📞 Контакты: ${m.contacts}`);
            
            if (additionalInfo.length > 0) {
                list3 += `\n   ${additionalInfo.join(' | ')}`;
            }
            
            list3 += '\n';
        }
        console.log(list3);
        
        // 4. Создание проекта
        console.log('4️⃣ СОЗДАНИЕ ПРОЕКТА:');
        let list4 = 'Список доступных менеджеров:\n';
        for (const m of managers) {
            let desc = [];
            if (m.specialization) desc.push(m.specialization);
            if (m.experience) desc.push(m.experience);
            if (m.skills) {
                let skills = m.skills;
                if (typeof skills === 'string') {
                    try {
                        const arr = JSON.parse(skills);
                        if (Array.isArray(arr)) skills = arr.join(', ');
                    } catch { /* ignore */ }
                }
                desc.push(`Навыки: ${skills}`);
            }
            if (m.achievements) desc.push(`Достижения: ${m.achievements}`);
            list4 += `• @${m.username} — ${m.first_name || ''} ${m.last_name || ''}`;
            if (desc.length) list4 += `\n   ${desc.join(' | ')}`;
            
            let additionalInfo = [];
            if (m.salary_range) additionalInfo.push(`💸 Зарплата: ${m.salary_range}`);
            if (m.contacts) additionalInfo.push(`📞 Контакты: ${m.contacts}`);
            
            if (additionalInfo.length > 0) {
                list4 += `\n   ${additionalInfo.join(' | ')}`;
            }
            
            list4 += '\n';
        }
        console.log(list4);
        
        console.log('✅ ВСЕ ФОРМАТЫ ПРОТЕСТИРОВАНЫ УСПЕШНО!');
        
    } catch (error) {
        console.error('❌ Ошибка при тестировании:', error);
    } finally {
        await pool.end();
    }
}

// Запускаем тест
testAllManagerDisplays(); 