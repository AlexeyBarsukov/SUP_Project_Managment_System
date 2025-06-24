const pool = require('./src/db/connection');
const Project = require('./src/db/models/Project');
const User = require('./src/db/models/User');

async function debugProject(projectId) {
    try {
        console.log('=== DEBUG PROJECT INFO ===');
        
        // Запрос для получения информации о проекте и менеджерах
        const query = `
            SELECT 
                p.id,
                p.name,
                p.status,
                p.customer_id,
                COUNT(pm.id) as total_managers,
                COUNT(CASE WHEN pm.status = 'accepted' THEN 1 END) as accepted_managers,
                COUNT(CASE WHEN pm.status = 'pending' THEN 1 END) as pending_managers
            FROM projects p
            LEFT JOIN project_managers pm ON p.id = pm.project_id
            WHERE p.id = $1
            GROUP BY p.id, p.name, p.status, p.customer_id
        `;
        
        const result = await pool.query(query, [projectId]);
        
        if (result.rows.length === 0) {
            console.log('❌ Проект не найден!');
            return;
        }
        
        const project = result.rows[0];
        console.log('📋 Проект:', project.name);
        console.log('🆔 ID:', project.id);
        console.log('📊 Статус:', project.status);
        console.log('👤 Customer ID:', project.customer_id);
        console.log('👥 Всего менеджеров:', project.total_managers);
        console.log('✅ Принятых менеджеров:', project.accepted_managers);
        console.log('⏳ Ожидающих менеджеров:', project.pending_managers);
        
        // Получаем детальную информацию о менеджерах
        const managersQuery = `
            SELECT 
                pm.id,
                pm.manager_id,
                pm.status,
                u.username,
                u.first_name,
                u.last_name
            FROM project_managers pm
            JOIN users u ON pm.manager_id = u.id
            WHERE pm.project_id = $1
            ORDER BY pm.status, u.username
        `;
        
        const managersResult = await pool.query(managersQuery, [projectId]);
        
        console.log('\n👨‍💼 Детальная информация о менеджерах:');
        if (managersResult.rows.length === 0) {
            console.log('   Нет менеджеров');
        } else {
            managersResult.rows.forEach((manager, index) => {
                console.log(`   ${index + 1}. @${manager.username} (${manager.first_name} ${manager.last_name || ''}) - ${manager.status}`);
            });
        }
        
        // Проверяем условия для отображения кнопки "Назначить менеджера"
        console.log('\n🔍 Проверка условий для кнопки "Назначить менеджера":');
        
        const allowedStatuses = ['active', 'searching_executors'];
        const statusAllowed = allowedStatuses.includes(project.status);
        console.log(`   1. Статус разрешен (${project.status}): ${statusAllowed ? '✅' : '❌'}`);
        
        const otherManagers = managersResult.rows.filter(m => m.manager_id !== project.customer_id);
        const noOtherManagers = otherManagers.length === 0;
        console.log(`   2. Нет других менеджеров (кроме заказчика): ${noOtherManagers ? '✅' : '❌'} (${otherManagers.length} других)`);
        
        const underLimit = project.total_managers < 3;
        console.log(`   3. Меньше 3 менеджеров: ${underLimit ? '✅' : '❌'} (${project.total_managers}/3)`);
        
        const shouldShowButton = statusAllowed && noOtherManagers && underLimit;
        console.log(`\n🎯 Кнопка должна отображаться: ${shouldShowButton ? '✅ ДА' : '❌ НЕТ'}`);
        
        if (!shouldShowButton) {
            console.log('\n🚫 Причины отсутствия кнопки:');
            if (!statusAllowed) {
                console.log('   - Неправильный статус проекта');
            }
            if (!noOtherManagers) {
                console.log('   - Есть другие менеджеры в проекте');
            }
            if (!underLimit) {
                console.log('   - Достигнут лимит менеджеров (3)');
            }
        }
        
    } catch (error) {
        console.error('❌ Ошибка при выполнении запроса:', error);
    }
}

// Функция для тестирования предварительного просмотра проекта
async function testProjectPreview() {
    try {
        console.log('\n=== ТЕСТ ПРЕДВАРИТЕЛЬНОГО ПРЕДПРОСМОТРА ПРОЕКТА ===');
        
        // Получаем проект 39
        const project = await Project.findById(39);
        if (!project) {
            console.log('❌ Проект 39 не найден');
            return;
        }
        
        console.log('📋 Проект найден:');
        console.log('- ID:', project.id);
        console.log('- Название:', project.name);
        console.log('- Статус:', project.status);
        console.log('- Заказчик ID:', project.customer_id);
        console.log('- Описание:', project.description);
        console.log('- Бюджет:', project.budget);
        console.log('- Срок:', project.deadline);
        console.log('- Требования:', project.requirements);
        console.log('- Условия работы:', project.work_conditions);
        console.log('- Доп. пожелания:', project.additional_wishes);
        
        // Получаем заказчика
        const customer = await User.findById(project.customer_id);
        if (customer) {
            console.log('\n👤 Заказчик:');
            console.log('- ID:', customer.id);
            console.log('- Username:', customer.username);
            console.log('- Имя:', customer.first_name, customer.last_name);
        }
        
        console.log('\n✅ Тест завершен - данные для предварительного просмотра доступны');
        
    } catch (error) {
        console.error('❌ Ошибка при тестировании предварительного просмотра:', error);
    }
}

// Функция для тестирования отображения всех полей проекта
async function testProjectFields() {
    try {
        console.log('\n=== ТЕСТ ОТОБРАЖЕНИЯ ПОЛЕЙ ПРОЕКТА ===');
        
        // Получаем проект 39
        const project = await Project.findById(39);
        if (!project) {
            console.log('❌ Проект 39 не найден');
            return;
        }
        
        console.log('📋 Все поля проекта:');
        console.log('- ID:', project.id);
        console.log('- Название:', project.name);
        console.log('- Описание:', project.description);
        console.log('- Статус:', project.status);
        console.log('- Заказчик ID:', project.customer_id);
        console.log('- Бюджет:', project.budget);
        console.log('- Срок:', project.deadline);
        console.log('- Требования к менеджеру:', project.manager_requirements);
        console.log('- Условия работы:', project.work_conditions);
        console.log('- Дополнительные пожелания:', project.additional_notes);
        console.log('- Создан:', project.created_at);
        
        // Проверяем, какие поля заполнены
        console.log('\n✅ Заполненные поля:');
        if (project.budget) console.log('✓ Бюджет');
        if (project.deadline) console.log('✓ Срок');
        if (project.manager_requirements) console.log('✓ Требования к менеджеру');
        if (project.work_conditions) console.log('✓ Условия работы');
        if (project.additional_notes) console.log('✓ Дополнительные пожелания');
        
        console.log('\n❌ Пустые поля:');
        if (!project.budget) console.log('✗ Бюджет');
        if (!project.deadline) console.log('✗ Срок');
        if (!project.manager_requirements) console.log('✗ Требования к менеджеру');
        if (!project.work_conditions) console.log('✗ Условия работы');
        if (!project.additional_notes) console.log('✗ Дополнительные пожелания');
        
        console.log('\n✅ Тест завершен');
        
    } catch (error) {
        console.error('❌ Ошибка при тестировании полей:', error);
    }
}

// Функция для тестирования логики отказа менеджера
async function testManagerDecline() {
    try {
        console.log('\n=== ТЕСТ ЛОГИКИ ОТКАЗА МЕНЕДЖЕРА ===');
        
        // Получаем проект 39
        const project = await Project.findById(39);
        if (!project) {
            console.log('❌ Проект 39 не найден');
            return;
        }
        
        console.log('📋 Проект до отказа:');
        console.log('- ID:', project.id);
        console.log('- Название:', project.name);
        console.log('- Статус:', project.status);
        console.log('- Заказчик ID:', project.customer_id);
        
        // Получаем менеджеров проекта
        const ProjectManager = require('./src/db/models/ProjectManager');
        const managers = await ProjectManager.findByProject(project.id);
        
        console.log('\n👨‍💼 Менеджеры проекта:');
        for (const m of managers) {
            const user = await User.findById(m.manager_id);
            console.log(`- ${user?.username || 'Неизвестно'} (ID: ${m.manager_id}) - статус: ${m.status}`);
        }
        
        // Получаем участников проекта
        const members = await Project.getMembers(project.id);
        console.log('\n👥 Участники проекта:');
        for (const m of members) {
            console.log(`- ${m.username || 'Неизвестно'} (ID: ${m.id}) - роль: ${m.member_role}`);
        }
        
        console.log('\n✅ Тест завершен');
        
    } catch (error) {
        console.error('❌ Ошибка при тестировании отказа менеджера:', error);
    }
}

// Функция для тестирования исправлений дублирования менеджеров
async function testManagerDuplicationFix() {
    try {
        console.log('\n=== ТЕСТ ИСПРАВЛЕНИЙ ДУБЛИРОВАНИЯ МЕНЕДЖЕРОВ ===');
        
        // Получаем проект 39
        const project = await Project.findById(39);
        if (!project) {
            console.log('❌ Проект 39 не найден');
            return;
        }
        
        console.log('📋 Проект:');
        console.log('- ID:', project.id);
        console.log('- Название:', project.name);
        console.log('- Статус:', project.status);
        
        // Получаем менеджеров проекта
        const ProjectManager = require('./src/db/models/ProjectManager');
        const managers = await ProjectManager.findByProject(project.id);
        
        console.log('\n👨‍💼 Менеджеры в project_managers:');
        for (const m of managers) {
            const user = await User.findById(m.manager_id);
            console.log(`- ${user?.username || 'Неизвестно'} (ID: ${m.manager_id}) - статус: ${m.status} - запись ID: ${m.id}`);
        }
        
        // Получаем участников проекта
        const members = await Project.getMembers(project.id);
        console.log('\n👥 Участники в project_members:');
        for (const m of members) {
            console.log(`- ${m.username || 'Неизвестно'} (ID: ${m.id}) - роль: ${m.member_role}`);
        }
        
        // Проверяем дубликаты
        const managerIds = managers.map(m => m.manager_id);
        const uniqueManagerIds = [...new Set(managerIds)];
        
        if (managerIds.length !== uniqueManagerIds.length) {
            console.log('\n⚠️ ОБНАРУЖЕНЫ ДУБЛИКАТЫ МЕНЕДЖЕРОВ!');
            console.log('Дубликаты:', managerIds.filter((id, index) => managerIds.indexOf(id) !== index));
        } else {
            console.log('\n✅ Дубликатов менеджеров не обнаружено');
        }
        
        console.log('\n✅ Тест завершен');
        
    } catch (error) {
        console.error('❌ Ошибка при тестировании исправлений:', error);
    }
}

// Функция для тестирования функционала выхода менеджера из проекта
async function testManagerLeaveProject() {
    try {
        console.log('\n=== ТЕСТ ФУНКЦИОНАЛА ВЫХОДА МЕНЕДЖЕРА ИЗ ПРОЕКТА ===');
        
        // Получаем проект 39
        const project = await Project.findById(39);
        if (!project) {
            console.log('❌ Проект 39 не найден');
            return;
        }
        
        console.log('📋 Проект:');
        console.log('- ID:', project.id);
        console.log('- Название:', project.name);
        console.log('- Статус:', project.status);
        console.log('- Заказчик ID:', project.customer_id);
        
        // Получаем менеджеров проекта
        const ProjectManager = require('./src/db/models/ProjectManager');
        const managers = await ProjectManager.findByProject(project.id);
        
        console.log('\n👨‍💼 Менеджеры в project_managers:');
        for (const m of managers) {
            const user = await User.findById(m.manager_id);
            console.log(`- ${user?.username || 'Неизвестно'} (ID: ${m.manager_id}) - статус: ${m.status} - запись ID: ${m.id}`);
        }
        
        // Получаем участников проекта
        const members = await Project.getMembers(project.id);
        console.log('\n👥 Участники в project_members:');
        for (const m of members) {
            console.log(`- ${m.username || 'Неизвестно'} (ID: ${m.id}) - роль: ${m.member_role}`);
        }
        
        // Проверяем условия для выхода
        const acceptedManagers = managers.filter(m => m.status === 'accepted');
        const canLeave = project.status !== 'completed' && project.status !== 'archived';
        
        console.log('\n🔍 Условия для выхода:');
        console.log('- Статус проекта позволяет выход:', canLeave);
        console.log('- Количество принятых менеджеров:', acceptedManagers.length);
        console.log('- Проект не завершен:', project.status !== 'completed');
        console.log('- Проект не в архиве:', project.status !== 'archived');
        
        if (acceptedManagers.length > 0) {
            console.log('\n✅ Менеджеры могут покинуть проект');
            for (const m of acceptedManagers) {
                const user = await User.findById(m.manager_id);
                console.log(`- @${user?.username || 'Неизвестно'} может покинуть проект`);
            }
        } else {
            console.log('\n❌ Нет принятых менеджеров для выхода');
        }
        
        console.log('\n✅ Тест завершен');
        
    } catch (error) {
        console.error('❌ Ошибка при тестировании выхода из проекта:', error);
    }
}

// Функция для тестирования динамической проверки ролей менеджеров
async function testDynamicRoleCheck() {
    try {
        console.log('\n=== ТЕСТ ДИНАМИЧЕСКОЙ ПРОВЕРКИ РОЛЕЙ МЕНЕДЖЕРОВ ===');
        
        // Получаем проект 39
        const project = await Project.findById(39);
        if (!project) {
            console.log('❌ Проект 39 не найден');
            return;
        }
        
        console.log('📋 Проект:');
        console.log('- ID:', project.id);
        console.log('- Название:', project.name);
        console.log('- Статус:', project.status);
        console.log('- Заказчик ID:', project.customer_id);
        
        // Получаем заказчика
        const customer = await User.findById(project.customer_id);
        console.log('\n👤 Заказчик:');
        console.log('- ID:', customer.id);
        console.log('- Username:', customer.username);
        console.log('- Роль:', customer.main_role);
        console.log('- Видимый:', customer.is_visible);
        
        // Получаем всех менеджеров в системе
        const allManagers = await User.findVisibleByRole('manager');
        console.log('\n👨‍💼 Все менеджеры в системе:');
        for (const m of allManagers) {
            console.log(`- @${m.username} (ID: ${m.id}) - роль: ${m.main_role} - видимый: ${m.is_visible}`);
        }
        
        // Получаем менеджеров проекта
        const ProjectManager = require('./src/db/models/ProjectManager');
        const projectManagers = await ProjectManager.findByProject(project.id);
        console.log('\n👨‍💼 Менеджеры проекта:');
        for (const m of projectManagers) {
            const user = await User.findById(m.manager_id);
            console.log(`- @${user?.username || 'Неизвестно'} (ID: ${m.manager_id}) - статус: ${m.status} - роль: ${user?.main_role}`);
        }
        
        // Проверяем доступных менеджеров для назначения
        const availableManagers = allManagers.filter(m => m.id !== customer.id);
        console.log('\n✅ Доступные менеджеры для назначения:');
        for (const m of availableManagers) {
            console.log(`- @${m.username} (ID: ${m.id}) - роль: ${m.main_role} - видимый: ${m.is_visible}`);
        }
        
        // Проверяем потенциальные проблемы
        console.log('\n🔍 Проверка потенциальных проблем:');
        
        // 1. Менеджеры, которые сменили роль
        const roleChangedManagers = allManagers.filter(m => m.main_role !== 'manager');
        if (roleChangedManagers.length > 0) {
            console.log('⚠️ Менеджеры, которые сменили роль:');
            for (const m of roleChangedManagers) {
                console.log(`  - @${m.username} (ID: ${m.id}) - текущая роль: ${m.main_role}`);
            }
        } else {
            console.log('✅ Все менеджеры имеют правильную роль');
        }
        
        // 2. Невидимые менеджеры
        const invisibleManagers = allManagers.filter(m => !m.is_visible);
        if (invisibleManagers.length > 0) {
            console.log('⚠️ Невидимые менеджеры:');
            for (const m of invisibleManagers) {
                console.log(`  - @${m.username} (ID: ${m.id}) - видимый: ${m.is_visible}`);
            }
        } else {
            console.log('✅ Все менеджеры видимые');
        }
        
        // 3. Менеджеры проекта с неправильной ролью
        const projectManagersWithWrongRole = [];
        for (const m of projectManagers) {
            const user = await User.findById(m.manager_id);
            if (user && user.main_role !== 'manager') {
                projectManagersWithWrongRole.push({ user, status: m.status });
            }
        }
        
        if (projectManagersWithWrongRole.length > 0) {
            console.log('⚠️ Менеджеры проекта с неправильной ролью:');
            for (const m of projectManagersWithWrongRole) {
                console.log(`  - @${m.user.username} (ID: ${m.user.id}) - роль: ${m.user.main_role} - статус в проекте: ${m.status}`);
            }
        } else {
            console.log('✅ Все менеджеры проекта имеют правильную роль');
        }
        
        console.log('\n✅ Тест завершен');
        
    } catch (error) {
        console.error('❌ Ошибка при тестировании динамической проверки ролей:', error);
    }
}

// Функция для симуляции смены роли и тестирования обработки
async function testRoleChangeSimulation() {
    try {
        console.log('\n=== ТЕСТ СИМУЛЯЦИИ СМЕНЫ РОЛИ ===');
        
        // Получаем пользователя Rimma_30
        const user = await User.findByTelegramId(2); // Предполагаем, что telegram_id = 2
        if (!user) {
            console.log('❌ Пользователь Rimma_30 не найден');
            return;
        }
        
        console.log('👤 Текущее состояние пользователя:');
        console.log('- ID:', user.id);
        console.log('- Username:', user.username);
        console.log('- Текущая роль:', user.main_role);
        console.log('- Видимый:', user.is_visible);
        
        // Симулируем смену роли обратно на менеджера
        console.log('\n🔄 Симулируем смену роли на менеджера...');
        const updatedUser = await User.updateMainRole(user.telegram_id, 'manager');
        
        console.log('✅ Роль изменена на:', updatedUser.main_role);
        
        // Проверяем, что пользователь теперь видимый менеджер
        const visibleManagers = await User.findVisibleByRole('manager');
        const isNowVisibleManager = visibleManagers.some(m => m.id === user.id);
        
        console.log('\n🔍 Проверка результата:');
        console.log('- Пользователь в списке видимых менеджеров:', isNowVisibleManager);
        console.log('- Количество видимых менеджеров:', visibleManagers.length);
        
        // Теперь симулируем смену роли на заказчика
        console.log('\n🔄 Симулируем смену роли на заказчика...');
        const updatedUser2 = await User.updateMainRole(user.telegram_id, 'customer');
        
        console.log('✅ Роль изменена на:', updatedUser2.main_role);
        
        // Проверяем, что пользователь больше не в списке менеджеров
        const visibleManagersAfter = await User.findVisibleByRole('manager');
        const isStillVisibleManager = visibleManagersAfter.some(m => m.id === user.id);
        
        console.log('\n🔍 Проверка результата:');
        console.log('- Пользователь все еще в списке менеджеров:', isStillVisibleManager);
        console.log('- Количество видимых менеджеров после смены:', visibleManagersAfter.length);
        
        // Проверяем проект 39
        const project = await Project.findById(39);
        if (project) {
            const ProjectManager = require('./src/db/models/ProjectManager');
            const projectManagers = await ProjectManager.findByProject(project.id);
            
            console.log('\n📋 Состояние проекта 39:');
            console.log('- Количество менеджеров в проекте:', projectManagers.length);
            
            for (const m of projectManagers) {
                const managerUser = await User.findById(m.manager_id);
                console.log(`  - @${managerUser?.username || 'Неизвестно'} (ID: ${m.manager_id}) - роль: ${managerUser?.main_role} - статус: ${m.status}`);
            }
        }
        
        console.log('\n✅ Тест завершен');
        
    } catch (error) {
        console.error('❌ Ошибка при тестировании смены роли:', error);
    }
}

// Тестирование отображения менеджеров с зарплатой и контактами
async function testManagerDisplay() {
    try {
        console.log('\n=== Тестирование отображения менеджеров ===');
        
        // Получаем всех видимых менеджеров
        const managers = await User.findVisibleByRole('manager');
        console.log(`Найдено менеджеров: ${managers.length}`);
        
        for (const m of managers) {
            console.log(`\n--- Менеджер: @${m.username} ---`);
            console.log(`Имя: ${m.first_name || ''} ${m.last_name || ''}`);
            console.log(`Специализация: ${m.specialization || 'не указана'}`);
            console.log(`Опыт: ${m.experience || 'не указан'}`);
            console.log(`Навыки: ${m.skills || 'не указаны'}`);
            console.log(`Зарплата: ${m.salary_range || 'не указана'}`);
            console.log(`Контакты: ${m.contacts || 'не указаны'}`);
            console.log(`Достижения: ${m.achievements || 'не указаны'}`);
        }
        
        // Тестируем форматирование списка
        console.log('\n=== Форматированный список менеджеров ===');
        let list = '👨‍💼 <b>Выберите менеджера:</b>\n\n';
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
            list += `• @${m.username} — ${m.first_name || ''} ${m.last_name || ''}`;
            if (desc.length) list += `\n   ${desc.join(' | ')}`;
            
            // Добавляем зарплату и контакты
            let additionalInfo = [];
            if (m.salary_range) additionalInfo.push(`💸 Зарплата: ${m.salary_range}`);
            if (m.contacts) additionalInfo.push(`📞 Контакты: ${m.contacts}`);
            
            if (additionalInfo.length > 0) {
                list += `\n   ${additionalInfo.join(' | ')}`;
            }
            
            list += '\n';
        }
        
        console.log(list);
        
    } catch (error) {
        console.error('Ошибка при тестировании отображения менеджеров:', error);
    }
}

// Получаем ID проекта из аргументов командной строки
const projectId = process.argv[2] ? parseInt(process.argv[2]) : 39;

// Запускаем отладку
debugProject(projectId)
    .then(() => {
        console.log('\n=== ОТЛАДКА ЗАВЕРШЕНА ===');
        return testProjectPreview();
    })
    .then(() => {
        console.log('\n=== ВСЕ ТЕСТЫ ЗАВЕРШЕНЫ ===');
        return testProjectFields();
    })
    .then(() => {
        console.log('\n=== ВСЕ ТЕСТЫ ЗАВЕРШЕНЫ ===');
        return testManagerDecline();
    })
    .then(() => {
        console.log('\n=== ВСЕ ТЕСТЫ ЗАВЕРШЕНЫ ===');
        return testManagerDuplicationFix();
    })
    .then(() => {
        console.log('\n=== ВСЕ ТЕСТЫ ЗАВЕРШЕНЫ ===');
        return testManagerLeaveProject();
    })
    .then(() => {
        console.log('\n=== ВСЕ ТЕСТЫ ЗАВЕРШЕНЫ ===');
        return testDynamicRoleCheck();
    })
    .then(() => {
        console.log('\n=== ВСЕ ТЕСТЫ ЗАВЕРШЕНЫ ===');
        return testRoleChangeSimulation();
    })
    .then(() => {
        console.log('\n=== ВСЕ ТЕСТЫ ЗАВЕРШЕНЫ ===');
        return testManagerDisplay();
    })
    .then(() => {
        console.log('\n=== ВСЕ ТЕСТЫ ЗАВЕРШЕНЫ ===');
        process.exit(0);
    })
    .catch(error => {
        console.error('❌ Ошибка:', error);
        process.exit(1);
    }); 