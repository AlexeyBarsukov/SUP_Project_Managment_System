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
    } finally {
        await pool.end();
    }
}

// Функция для тестирования предварительного просмотра проекта
async function testProjectPreview() {
    try {
        console.log('\n=== ТЕСТ ПРЕДВАРИТЕЛЬНОГО ПРЕДПРОСМОТРА ПРОЕКТА ===');
        
        // Получаем проект 36
        const project = await Project.findById(36);
        if (!project) {
            console.log('❌ Проект 36 не найден');
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

// Получаем ID проекта из аргументов командной строки
const projectId = process.argv[2] ? parseInt(process.argv[2]) : 36;

// Запускаем отладку
debugProject(projectId)
    .then(() => {
        console.log('\n=== ОТЛАДКА ЗАВЕРШЕНА ===');
        return testProjectPreview();
    })
    .then(() => {
        console.log('\n=== ВСЕ ТЕСТЫ ЗАВЕРШЕНЫ ===');
        process.exit(0);
    })
    .catch(error => {
        console.error('❌ Ошибка:', error);
        process.exit(1);
    }); 