require('dotenv').config();
const ExecutorApplication = require('./src/db/models/ExecutorApplication');
const ProjectRole = require('./src/db/models/ProjectRole');
const User = require('./src/db/models/User');
const Project = require('./src/db/models/Project');

async function testApplicationAccept() {
    try {
        console.log('🧪 Тестирование функциональности принятия откликов...\n');
        
        // Проверяем, есть ли отклики в системе
        const applications = await ExecutorApplication.findByProject(1);
        console.log(`📊 Найдено откликов: ${applications.length}`);
        
        if (applications.length === 0) {
            console.log('❌ Нет откликов для тестирования');
            return;
        }
        
        // Показываем информацию о каждом отклике
        for (const app of applications) {
            console.log(`\n📋 Отклик ID: ${app.id}`);
            console.log(`   Статус: ${app.status}`);
            console.log(`   Исполнитель: ${app.first_name} ${app.last_name || ''} (@${app.username})`);
            console.log(`   Роль: ${app.role_name}`);
            console.log(`   Проект: ${app.project_name}`);
            console.log(`   Создан: ${new Date(app.created_at).toLocaleDateString('ru-RU')}`);
            
            if (app.status === 'pending') {
                console.log('   ⏳ Ожидает рассмотрения');
            } else if (app.status === 'accepted') {
                console.log('   ✅ Принят');
            } else if (app.status === 'declined') {
                console.log('   ❌ Отклонен');
            }
        }
        
        // Проверяем роли проекта
        const roles = await ProjectRole.findByProjectId(1);
        console.log(`\n📊 Роли проекта: ${roles.length}`);
        for (const role of roles) {
            console.log(`   - ${role.role_name}: ${role.filled_positions}/${role.positions_count} (доступно: ${role.positions_count - role.filled_positions})`);
        }
        
        console.log('\n✅ Тест завершен');
        
    } catch (error) {
        console.error('❌ Ошибка при тестировании:', error.message);
    }
}

testApplicationAccept(); 