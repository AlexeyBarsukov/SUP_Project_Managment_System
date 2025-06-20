const pool = require('./src/db/connection');

async function listProjects() {
    try {
        console.log('=== СПИСОК ВСЕХ ПРОЕКТОВ ===');
        
        const query = `
            SELECT 
                p.id,
                p.name,
                p.status,
                p.customer_id,
                u.username as customer_username,
                COUNT(pm.id) as total_managers
            FROM projects p
            LEFT JOIN users u ON p.customer_id = u.id
            LEFT JOIN project_managers pm ON p.id = pm.project_id
            GROUP BY p.id, p.name, p.status, p.customer_id, u.username
            ORDER BY p.id DESC
            LIMIT 20
        `;
        
        const result = await pool.query(query);
        
        if (result.rows.length === 0) {
            console.log('❌ Проекты не найдены!');
            return;
        }
        
        console.log('📋 Последние проекты:');
        result.rows.forEach((project, index) => {
            console.log(`   ${index + 1}. ID: ${project.id} | "${project.name}" | Статус: ${project.status} | Заказчик: @${project.customer_username} | Менеджеров: ${project.total_managers}`);
        });
        
    } catch (error) {
        console.error('❌ Ошибка при выполнении запроса:', error);
    } finally {
        await pool.end();
    }
}

listProjects(); 