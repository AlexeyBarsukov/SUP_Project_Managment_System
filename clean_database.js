const { Pool } = require('pg');
const pool = new Pool({
    host: 'localhost',
    port: 5432,
    database: 'project_management',
    user: 'postgres',
    password: 'password'
});

async function cleanDatabase() {
    console.log('🧹 Начинаем полную очистку базы данных...\n');
    
    try {
        const client = await pool.connect();
        
        // Отключаем проверку внешних ключей для безопасного удаления
        await client.query('SET session_replication_role = replica;');
        
        console.log('1. Очищаем таблицу audit_log...');
        await client.query('DELETE FROM audit_log');
        console.log('✅ audit_log очищена');
        
        console.log('2. Очищаем таблицу project_messages...');
        await client.query('DELETE FROM project_messages');
        console.log('✅ project_messages очищена');
        
        console.log('3. Очищаем таблицу executor_applications...');
        await client.query('DELETE FROM executor_applications');
        console.log('✅ executor_applications очищена');
        
        console.log('4. Очищаем таблицу project_members...');
        await client.query('DELETE FROM project_members');
        console.log('✅ project_members очищена');
        
        console.log('5. Очищаем таблицу project_roles...');
        await client.query('DELETE FROM project_roles');
        console.log('✅ project_roles очищена');
        
        console.log('6. Очищаем таблицу manager_invitations...');
        await client.query('DELETE FROM manager_invitations');
        console.log('✅ manager_invitations очищена');
        
        console.log('7. Очищаем таблицу project_managers...');
        await client.query('DELETE FROM project_managers');
        console.log('✅ project_managers очищена');
        
        console.log('8. Очищаем таблицу projects...');
        await client.query('DELETE FROM projects');
        console.log('✅ projects очищена');
        
        console.log('9. Очищаем таблицу users...');
        await client.query('DELETE FROM users');
        console.log('✅ users очищена');
        
        // Включаем обратно проверку внешних ключей
        await client.query('SET session_replication_role = DEFAULT;');
        
        // Сбрасываем автоинкрементные счетчики
        console.log('10. Сбрасываем автоинкрементные счетчики...');
        await client.query('ALTER SEQUENCE users_id_seq RESTART WITH 1');
        await client.query('ALTER SEQUENCE projects_id_seq RESTART WITH 1');
        await client.query('ALTER SEQUENCE project_roles_id_seq RESTART WITH 1');
        await client.query('ALTER SEQUENCE executor_applications_id_seq RESTART WITH 1');
        await client.query('ALTER SEQUENCE project_managers_id_seq RESTART WITH 1');
        await client.query('ALTER SEQUENCE manager_invitations_id_seq RESTART WITH 1');
        await client.query('ALTER SEQUENCE project_messages_id_seq RESTART WITH 1');
        await client.query('ALTER SEQUENCE audit_log_id_seq RESTART WITH 1');
        console.log('✅ Счетчики сброшены');
        
        // Проверяем, что все таблицы пусты
        console.log('\n11. Проверяем состояние таблиц...');
        const tables = [
            'users',
            'projects', 
            'project_roles',
            'executor_applications',
            'project_members',
            'project_managers',
            'manager_invitations',
            'project_messages',
            'audit_log'
        ];
        
        for (const table of tables) {
            const result = await client.query(`SELECT COUNT(*) as count FROM ${table}`);
            const count = parseInt(result.rows[0].count);
            console.log(`📊 ${table}: ${count} записей`);
            
            if (count > 0) {
                console.log(`⚠️  В таблице ${table} остались записи!`);
            }
        }
        
        console.log('\n🎉 База данных успешно очищена!');
        console.log('✅ Все таблицы пусты');
        console.log('✅ Автоинкрементные счетчики сброшены');
        console.log('✅ База данных готова для новых пользователей');
        
        console.log('\n📝 Что произошло:');
        console.log('• Удалены все пользователи (исполнители, менеджеры, заказчики)');
        console.log('• Удалены все проекты');
        console.log('• Удалены все роли и вакансии проектов');
        console.log('• Удалены все заявки исполнителей');
        console.log('• Удалены все связи между пользователями и проектами');
        console.log('• Удалены все приглашения менеджеров');
        console.log('• Удалены все сообщения в проектах');
        console.log('• Удалены все записи аудита');
        console.log('• Сброшены все автоинкрементные счетчики');
        
        console.log('\n🚀 Теперь все пользователи будут начинать с чистого листа!');
        console.log('🔧 Система готова для нового тестирования');
        
    } catch (error) {
        console.error('❌ Ошибка при очистке базы данных:', error);
        console.error('Stack trace:', error.stack);
    } finally {
        await pool.end();
    }
}

cleanDatabase(); 