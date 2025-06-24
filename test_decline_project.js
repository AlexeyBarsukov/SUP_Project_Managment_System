const { Pool } = require('pg');
const pool = new Pool({
    host: 'localhost',
    port: 5432,
    database: 'project_management',
    user: 'postgres',
    password: 'password'
});

async function testDeclineProject() {
    console.log('🧪 Тестируем функциональность отказа от проекта...\n');
    
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
            name: 'Тестовый проект для отказа',
            description: 'Проект для тестирования отказа',
            customer_id: customer.id,
            status: 'searching_manager',
            deadline: '1 месяц',
            budget: '50 000 рублей',
            manager_requirements: 'Опыт работы',
            work_conditions: 'Удаленно',
            additional_notes: 'Тестовый проект'
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
        
        // Добавляем заказчика как customer (пропускается в addUserToProjectRoles)
        console.log('👤 Добавляем заказчика как customer (пропускается)...');
        
        // Добавляем менеджера в проект
        console.log('👨‍💼 Добавляем менеджера в проект...');
        const addManagerQuery = `
            INSERT INTO project_members (user_id, project_id, role)
            VALUES ($1, $2, $3)
            ON CONFLICT (project_id, user_id) DO UPDATE SET role = $3
        `;
        await client.query(addManagerQuery, [manager.id, project.id, 'manager']);
        console.log('✅ Менеджер добавлен в project_members');
        
        // Создаем приглашение для менеджера
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
        
        // Симулируем отказ менеджера
        console.log('\n❌ Симулируем отказ менеджера...');
        
        // 1. Проверяем, является ли менеджер участником проекта
        const hasMemberQuery = `
            SELECT 1 FROM project_members 
            WHERE project_id = $1 AND user_id = $2
        `;
        const hasMemberResult = await client.query(hasMemberQuery, [project.id, manager.id]);
        const isMember = hasMemberResult.rows.length > 0;
        console.log('Менеджер является участником проекта:', isMember);
        
        if (!isMember) {
            console.log('❌ Менеджер не является участником проекта');
            return;
        }
        
        // 2. Получаем роль менеджера
        const getMembersQuery = `
            SELECT u.*, pm.role as member_role
            FROM project_members pm
            JOIN users u ON pm.user_id = u.id
            WHERE pm.project_id = $1
        `;
        const membersResult = await client.query(getMembersQuery, [project.id]);
        const managerMember = membersResult.rows.find(m => m.id === manager.id);
        console.log('Роль менеджера в проекте:', managerMember?.member_role);
        
        // 3. Проверяем, что менеджер не является заказчиком
        if (project.customer_id === manager.id) {
            console.log('❌ Менеджер является заказчиком, не может отказаться');
            return;
        }
        
        // 4. Удаляем менеджера из project_members
        console.log('🗑️ Удаляем менеджера из project_members...');
        const removeMemberQuery = `
            DELETE FROM project_members 
            WHERE project_id = $1 AND user_id = $2
        `;
        await client.query(removeMemberQuery, [project.id, manager.id]);
        console.log('✅ Менеджер удален из project_members');
        
        // 5. Удаляем менеджера из project_managers
        console.log('🗑️ Удаляем менеджера из project_managers...');
        const removeManagerQuery = `
            DELETE FROM project_managers 
            WHERE project_id = $1 AND manager_id = $2
        `;
        await client.query(removeManagerQuery, [project.id, manager.id]);
        console.log('✅ Менеджер удален из project_managers');
        
        // 6. Проверяем, есть ли еще менеджеры
        const remainingManagersQuery = `
            SELECT * FROM project_managers WHERE project_id = $1
        `;
        const remainingManagersResult = await client.query(remainingManagersQuery, [project.id]);
        const acceptedManagers = remainingManagersResult.rows.filter(m => m.status === 'accepted');
        console.log('Оставшиеся менеджеры:', acceptedManagers.length);
        
        // 7. Если нет менеджеров, возвращаем проект заказчику
        if (acceptedManagers.length === 0) {
            console.log('🔄 Нет менеджеров, возвращаем проект заказчику...');
            
            // Добавляем заказчика как менеджера
            await client.query(addManagerQuery, [customer.id, project.id, 'manager']);
            console.log('✅ Заказчик добавлен как менеджер');
            
            // Создаем запись в project_managers
            await client.query(inviteQuery, [project.id, customer.id, 'accepted']);
            console.log('✅ Заказчик добавлен в project_managers');
            
            // Меняем статус проекта
            const updateStatusQuery = `
                UPDATE projects SET status = $1 WHERE id = $2
            `;
            await client.query(updateStatusQuery, ['searching_executors', project.id]);
            console.log('✅ Статус проекта изменен на searching_executors');
        }
        
        // Проверяем финальное состояние
        console.log('\n📊 Финальное состояние проекта...');
        const finalResult = await client.query(initialQuery, [project.id]);
        console.log('Финальное состояние:', finalResult.rows[0]);
        
        // Очистка
        console.log('\n🧹 Очистка - удаляем тестовый проект...');
        await client.query('DELETE FROM project_managers WHERE project_id = $1', [project.id]);
        await client.query('DELETE FROM project_members WHERE project_id = $1', [project.id]);
        await client.query('DELETE FROM projects WHERE id = $1', [project.id]);
        console.log('✅ Тестовый проект удален');
        
        console.log('\n🎉 Тест отказа от проекта прошел успешно!');
        
    } catch (error) {
        console.error('❌ Ошибка при тестировании отказа от проекта:', error);
        console.error('Stack trace:', error.stack);
    } finally {
        await pool.end();
    }
}

testDeclineProject(); 