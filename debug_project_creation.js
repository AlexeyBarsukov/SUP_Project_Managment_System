const { Pool } = require('pg');
const pool = new Pool({
    host: 'localhost',
    port: 5432,
    database: 'project_management',
    user: 'postgres',
    password: 'password'
});

async function debugProjectCreation() {
    console.log('🔍 Начинаем диагностику создания проекта...\n');
    
    try {
        // 1. Проверяем подключение к БД
        console.log('1. Проверка подключения к БД...');
        const client = await pool.connect();
        console.log('✅ Подключение к БД успешно\n');
        
        // 2. Проверяем существование пользователя-заказчика
        console.log('2. Проверка пользователя-заказчика...');
        const customerQuery = `
            SELECT id, telegram_id, username, first_name, last_name, main_role 
            FROM users 
            WHERE main_role = 'customer' 
            LIMIT 1
        `;
        const customerResult = await client.query(customerQuery);
        
        if (customerResult.rows.length === 0) {
            console.log('❌ Нет пользователей с ролью customer');
            return;
        }
        
        const customer = customerResult.rows[0];
        console.log('✅ Найден заказчик:', {
            id: customer.id,
            telegram_id: customer.telegram_id,
            username: customer.username,
            name: `${customer.first_name} ${customer.last_name}`,
            role: customer.main_role
        });
        
        // 3. Проверяем существование менеджера @Aleksey_Barsukov_development
        console.log('\n3. Проверка менеджера @Aleksey_Barsukov_development...');
        const managerQuery = `
            SELECT id, telegram_id, username, first_name, last_name, main_role,
                   specialization, experience, skills, salary_range, contacts
            FROM users 
            WHERE username = 'Aleksey_Barsukov_development'
        `;
        const managerResult = await client.query(managerQuery);
        
        if (managerResult.rows.length === 0) {
            console.log('❌ Менеджер @Aleksey_Barsukov_development не найден');
        } else {
            const manager = managerResult.rows[0];
            console.log('✅ Найден менеджер:', {
                id: manager.id,
                telegram_id: manager.telegram_id,
                username: manager.username,
                name: `${manager.first_name} ${manager.last_name}`,
                role: manager.main_role,
                specialization: manager.specialization,
                salary_range: manager.salary_range,
                contacts: manager.contacts
            });
        }
        
        // 4. Проверяем структуру таблицы projects
        console.log('\n4. Проверка структуры таблицы projects...');
        const tableQuery = `
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_name = 'projects' 
            ORDER BY ordinal_position
        `;
        const tableResult = await client.query(tableQuery);
        console.log('Структура таблицы projects:');
        tableResult.rows.forEach(col => {
            console.log(`  ${col.column_name}: ${col.data_type} ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
        });
        
        // 5. Пробуем создать тестовый проект
        console.log('\n5. Тестовое создание проекта...');
        const testProjectData = {
            name: 'DNS',
            description: 'настройка серверов',
            customer_id: customer.id,
            status: 'draft',
            deadline: 'до 30.07.2025',
            budget: '70 000 руб.',
            manager_requirements: 'Опыт работы с серверами',
            work_conditions: 'Удаленно',
            additional_notes: null
        };
        
        console.log('Данные проекта:', testProjectData);
        
        const createQuery = `
            INSERT INTO projects (name, description, customer_id, status, deadline, budget, manager_requirements, work_conditions, additional_notes)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
        `;
        
        const createValues = [
            testProjectData.name,
            testProjectData.description,
            testProjectData.customer_id,
            testProjectData.status,
            testProjectData.deadline,
            testProjectData.budget,
            testProjectData.manager_requirements,
            testProjectData.work_conditions,
            testProjectData.additional_notes
        ];
        
        console.log('Выполняем INSERT...');
        const createResult = await client.query(createQuery, createValues);
        console.log('✅ Проект создан успешно:', createResult.rows[0]);
        
        const projectId = createResult.rows[0].id;
        
        // 6. Проверяем добавление ролей
        console.log('\n6. Проверка добавления ролей...');
        
        // Добавляем заказчика как customer (пропускается в addUserToProjectRoles)
        console.log('Добавляем заказчика как customer (пропускается)...');
        
        // Добавляем заказчика как manager
        console.log('Добавляем заказчика как manager...');
        const addManagerQuery = `
            INSERT INTO project_members (user_id, project_id, role)
            VALUES ($1, $2, $3)
            ON CONFLICT (project_id, user_id) DO UPDATE SET role = $3
        `;
        await client.query(addManagerQuery, [customer.id, projectId, 'manager']);
        console.log('✅ Заказчик добавлен как manager');
        
        // 7. Проверяем создание записи в project_managers
        console.log('\n7. Создание записи в project_managers...');
        const pmQuery = `
            INSERT INTO project_managers (project_id, manager_id, status)
            VALUES ($1, $2, $3)
            RETURNING *
        `;
        const pmResult = await client.query(pmQuery, [projectId, customer.id, 'accepted']);
        console.log('✅ Запись в project_managers создана:', pmResult.rows[0]);
        
        // 8. Если есть менеджер, пробуем добавить его
        if (managerResult.rows.length > 0) {
            console.log('\n8. Добавление дополнительного менеджера...');
            
            // Добавляем в project_members
            await client.query(addManagerQuery, [managerResult.rows[0].id, projectId, 'manager']);
            console.log('✅ Менеджер добавлен в project_members');
            
            // Создаем приглашение в project_managers
            const inviteQuery = `
                INSERT INTO project_managers (project_id, manager_id, status)
                VALUES ($1, $2, $3)
                RETURNING *
            `;
            const inviteResult = await client.query(inviteQuery, [projectId, managerResult.rows[0].id, 'pending']);
            console.log('✅ Приглашение создано:', inviteResult.rows[0]);
        }
        
        // 9. Проверяем финальное состояние
        console.log('\n9. Финальное состояние проекта...');
        const finalQuery = `
            SELECT p.*, 
                   array_agg(DISTINCT pm.role) as member_roles,
                   array_agg(DISTINCT pm2.status) as manager_statuses
            FROM projects p
            LEFT JOIN project_members pm ON p.id = pm.project_id
            LEFT JOIN project_managers pm2 ON p.id = pm2.project_id
            WHERE p.id = $1
            GROUP BY p.id
        `;
        const finalResult = await client.query(finalQuery, [projectId]);
        console.log('Финальное состояние:', finalResult.rows[0]);
        
        // 10. Очистка - удаляем тестовый проект
        console.log('\n10. Очистка - удаляем тестовый проект...');
        await client.query('DELETE FROM project_managers WHERE project_id = $1', [projectId]);
        await client.query('DELETE FROM project_members WHERE project_id = $1', [projectId]);
        await client.query('DELETE FROM projects WHERE id = $1', [projectId]);
        console.log('✅ Тестовый проект удален');
        
        console.log('\n🎉 Диагностика завершена успешно! Все операции прошли без ошибок.');
        
    } catch (error) {
        console.error('❌ Ошибка при диагностике:', error);
        console.error('Stack trace:', error.stack);
    } finally {
        await pool.end();
    }
}

debugProjectCreation(); 