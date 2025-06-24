const { Pool } = require('pg');
const pool = new Pool({
    host: 'localhost',
    port: 5432,
    database: 'project_management',
    user: 'postgres',
    password: 'password'
});

async function testProjectCreation() {
    console.log('🧪 Тестируем создание проекта после исправления...\n');
    
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
        
        // Тестовые данные проекта (как в ошибке)
        const projectData = {
            name: 'высота',
            description: 'раз два три',
            customer_id: customer.id,
            status: 'searching_manager',
            deadline: 'нет срока',
            budget: '40 000 рублей',
            manager_requirements: 'требования такие-то по телефону расскажу',
            work_conditions: 'гибрид',
            additional_notes: 'нет'
        };
        
        console.log('\n📝 Создаем проект:', projectData.name);
        
        // 1. Создаем проект
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
        
        // 2. Добавляем заказчика как customer (пропускается в addUserToProjectRoles)
        console.log('👤 Добавляем заказчика как customer (пропускается)...');
        
        // 3. Добавляем заказчика как manager
        console.log('👨‍💼 Добавляем заказчика как manager...');
        const addManagerQuery = `
            INSERT INTO project_members (user_id, project_id, role)
            VALUES ($1, $2, $3)
            ON CONFLICT (project_id, user_id) DO UPDATE SET role = $3
        `;
        await client.query(addManagerQuery, [customer.id, project.id, 'manager']);
        console.log('✅ Заказчик добавлен как manager');
        
        // 4. Создаем запись в project_managers для заказчика
        console.log('📋 Создаем запись в project_managers для заказчика...');
        const pmQuery = `
            INSERT INTO project_managers (project_id, manager_id, status)
            VALUES ($1, $2, $3)
            ON CONFLICT (project_id, manager_id) DO UPDATE SET status = $3
            RETURNING *
        `;
        const pmResult = await client.query(pmQuery, [project.id, customer.id, 'accepted']);
        console.log('✅ Запись в project_managers создана:', pmResult.rows[0].id);
        
        // 5. Добавляем дополнительного менеджера
        console.log('👨‍💼 Добавляем дополнительного менеджера...');
        await client.query(addManagerQuery, [manager.id, project.id, 'manager']);
        console.log('✅ Менеджер добавлен в project_members');
        
        // 6. Создаем приглашение для менеджера
        console.log('📨 Создаем приглашение для менеджера...');
        const inviteQuery = `
            INSERT INTO project_managers (project_id, manager_id, status)
            VALUES ($1, $2, $3)
            ON CONFLICT (project_id, manager_id) DO UPDATE SET status = $3
            RETURNING *
        `;
        const inviteResult = await client.query(inviteQuery, [project.id, manager.id, 'pending']);
        console.log('✅ Приглашение создано:', inviteResult.rows[0].id);
        
        // 7. Проверяем финальное состояние
        console.log('\n📊 Финальное состояние проекта...');
        const finalQuery = `
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
        const finalResult = await client.query(finalQuery, [project.id]);
        console.log('Финальное состояние:', finalResult.rows[0]);
        
        // 8. Очистка
        console.log('\n🧹 Очистка - удаляем тестовый проект...');
        await client.query('DELETE FROM project_managers WHERE project_id = $1', [project.id]);
        await client.query('DELETE FROM project_members WHERE project_id = $1', [project.id]);
        await client.query('DELETE FROM projects WHERE id = $1', [project.id]);
        console.log('✅ Тестовый проект удален');
        
        console.log('\n🎉 Тест прошел успешно! ON CONFLICT работает корректно.');
        
    } catch (error) {
        console.error('❌ Ошибка при тестировании:', error);
        console.error('Stack trace:', error.stack);
    } finally {
        await pool.end();
    }
}

testProjectCreation(); 