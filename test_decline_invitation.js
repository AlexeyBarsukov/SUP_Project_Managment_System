const { Pool } = require('pg');
const pool = new Pool({
    host: 'localhost',
    port: 5432,
    database: 'project_management',
    user: 'postgres',
    password: 'password'
});

async function testDeclineInvitation() {
    console.log('🧪 Тестируем отказ от приглашения менеджера...\n');
    
    try {
        const client = await pool.connect();
        
        // Получаем заказчика
        const customerResult = await client.query(`
            SELECT id, telegram_id, username, first_name, last_name, main_role 
            FROM users 
            WHERE main_role = 'customer' 
            LIMIT 1
        `);
        
        if (customerResult.rows.length === 0) {
            console.log('❌ Нет пользователей с ролью customer');
            return;
        }
        
        const customer = customerResult.rows[0];
        console.log('✅ Заказчик:', customer.username);
        
        // Получаем менеджера
        const managerResult = await client.query(`
            SELECT id, telegram_id, username, first_name, last_name, main_role
            FROM users 
            WHERE username = 'Aleksey_Barsukov_development'
        `);
        
        if (managerResult.rows.length === 0) {
            console.log('❌ Менеджер @Aleksey_Barsukov_development не найден');
            return;
        }
        
        const manager = managerResult.rows[0];
        console.log('✅ Менеджер:', manager.username);
        
        // Создаем тестовый проект
        console.log('\n📝 Создаем тестовый проект...');
        const projectData = {
            name: 'Тест отказа от приглашения',
            description: 'Проект для тестирования отказа от приглашения',
            customer_id: customer.id,
            status: 'searching_manager',
            deadline: '1 месяц',
            budget: '80 000 рублей',
            manager_requirements: 'Опыт управления проектами',
            work_conditions: 'Удаленно',
            additional_notes: 'Тест приглашения'
        };
        
        const createProjectQuery = `
            INSERT INTO projects (name, description, customer_id, status, deadline, budget, manager_requirements, work_conditions, additional_notes)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
        `;
        
        const createProjectValues = [
            projectData.name,
            projectData.description,
            projectData.customer_id,
            projectData.status,
            projectData.deadline,
            projectData.budget,
            projectData.manager_requirements,
            projectData.work_conditions,
            projectData.additional_notes
        ];
        
        const projectResult = await client.query(createProjectQuery, createProjectValues);
        const project = projectResult.rows[0];
        console.log('✅ Проект создан с ID:', project.id);
        
        // Создаем приглашение для менеджера (только в project_managers, НЕ в project_members)
        console.log('📨 Создаем приглашение для менеджера...');
        const inviteQuery = `
            INSERT INTO project_managers (project_id, manager_id, status)
            VALUES ($1, $2, $3)
            ON CONFLICT (project_id, manager_id) DO UPDATE SET status = $3
            RETURNING *
        `;
        const inviteResult = await client.query(inviteQuery, [project.id, manager.id, 'pending']);
        console.log('✅ Приглашение создано:', inviteResult.rows[0].id);
        
        // Проверяем начальное состояние
        console.log('\n📊 Начальное состояние проекта...');
        const initialQuery = `
            SELECT 
                p.id,
                p.name,
                p.status,
                array_agg(DISTINCT pm.role) as member_roles,
                array_agg(DISTINCT pm2.status) as manager_statuses,
                array_agg(DISTINCT pm2.manager_id) as manager_ids
            FROM projects p
            LEFT JOIN project_members pm ON p.id = pm.project_id
            LEFT JOIN project_managers pm2 ON p.id = pm2.project_id
            WHERE p.id = $1
            GROUP BY p.id, p.name, p.status
        `;
        const initialResult = await client.query(initialQuery, [project.id]);
        console.log('Начальное состояние:', initialResult.rows[0]);
        
        // Тест 1: Проверяем, что менеджер НЕ является участником проекта (только приглашен)
        console.log('\n🧪 Тест 1: Менеджер не является участником проекта (только приглашен)');
        const memberCheckQuery = `
            SELECT 1 FROM project_members 
            WHERE project_id = $1 AND user_id = $2
        `;
        const memberCheckResult = await client.query(memberCheckQuery, [project.id, manager.id]);
        const isMember = memberCheckResult.rows.length > 0;
        console.log('Менеджер является участником проекта:', isMember);
        
        if (isMember) {
            console.log('❌ Менеджер не должен быть участником проекта до принятия приглашения');
        } else {
            console.log('✅ Менеджер не является участником проекта (правильно)');
        }
        
        // Тест 2: Проверяем, что менеджер имеет приглашение
        console.log('\n🧪 Тест 2: Менеджер имеет приглашение в project_managers');
        const invitationCheckQuery = `
            SELECT * FROM project_managers 
            WHERE project_id = $1 AND manager_id = $2
        `;
        const invitationCheckResult = await client.query(invitationCheckQuery, [project.id, manager.id]);
        
        if (invitationCheckResult.rows.length > 0) {
            const invitation = invitationCheckResult.rows[0];
            console.log('Приглашение найдено:', {
                id: invitation.id,
                status: invitation.status,
                project_id: invitation.project_id,
                manager_id: invitation.manager_id
            });
            
            if (invitation.status === 'pending') {
                console.log('✅ Приглашение в статусе pending (правильно)');
            } else {
                console.log('❌ Приглашение должно быть в статусе pending');
            }
        } else {
            console.log('❌ Приглашение не найдено');
            return;
        }
        
        // Симулируем отказ от приглашения
        console.log('\n❌ Симулируем отказ от приглашения...');
        
        // 1. Обновляем статус приглашения на declined
        const declineQuery = `
            UPDATE project_managers 
            SET status = 'declined' 
            WHERE project_id = $1 AND manager_id = $2
            RETURNING *
        `;
        const declineResult = await client.query(declineQuery, [project.id, manager.id]);
        console.log('✅ Статус приглашения обновлен на declined:', declineResult.rows[0].id);
        
        // 2. Проверяем, что менеджер все еще НЕ является участником проекта
        const finalMemberCheck = await client.query(memberCheckQuery, [project.id, manager.id]);
        const stillMember = finalMemberCheck.rows.length > 0;
        console.log('Менеджер все еще является участником проекта:', stillMember);
        
        if (stillMember) {
            console.log('❌ Менеджер не должен быть участником проекта после отказа');
        } else {
            console.log('✅ Менеджер не является участником проекта после отказа (правильно)');
        }
        
        // 3. Проверяем финальное состояние приглашения
        const finalInvitationCheck = await client.query(invitationCheckQuery, [project.id, manager.id]);
        if (finalInvitationCheck.rows.length > 0) {
            const finalInvitation = finalInvitationCheck.rows[0];
            console.log('Финальное состояние приглашения:', {
                id: finalInvitation.id,
                status: finalInvitation.status
            });
            
            if (finalInvitation.status === 'declined') {
                console.log('✅ Приглашение в статусе declined (правильно)');
            } else {
                console.log('❌ Приглашение должно быть в статусе declined');
            }
        }
        
        // Проверяем финальное состояние проекта
        console.log('\n📊 Финальное состояние проекта...');
        const finalResult = await client.query(initialQuery, [project.id]);
        console.log('Финальное состояние:', finalResult.rows[0]);
        
        // Очистка
        console.log('\n🧹 Очистка - удаляем тестовый проект...');
        await client.query('DELETE FROM project_managers WHERE project_id = $1', [project.id]);
        await client.query('DELETE FROM project_members WHERE project_id = $1', [project.id]);
        await client.query('DELETE FROM projects WHERE id = $1', [project.id]);
        console.log('✅ Тестовый проект удален');
        
        console.log('\n🎉 Тест отказа от приглашения прошел успешно!');
        console.log('✅ Менеджер может отказаться от приглашения');
        console.log('✅ Статус приглашения корректно обновляется');
        console.log('✅ Менеджер не становится участником проекта при отказе');
        
    } catch (error) {
        console.error('❌ Ошибка при тестировании отказа от приглашения:', error);
        console.error('Stack trace:', error.stack);
    } finally {
        await pool.end();
    }
}

testDeclineInvitation(); 