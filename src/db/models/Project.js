const pool = require('../connection');

class Project {
    static async create(projectName, description, customerId, status = 'draft', extra = {}) {
        const query = `
            INSERT INTO projects (name, description, customer_id, status, deadline, budget, manager_requirements, work_conditions, additional_notes)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
        `;
        const values = [
            projectName,
            description,
            customerId,
            status,
            extra.deadline || null,
            extra.budget || null,
            extra.manager_requirements || null,
            extra.work_conditions || null,
            extra.additional_notes || null
        ];
        
        try {
            const result = await pool.query(query, values);
            return result.rows[0];
        } catch (error) {
            console.error('Error in Project.create:', error, { projectName, description, customerId });
            throw new Error(`Error creating project: ${error.message}`);
        }
    }

    static async findById(id) {
        const query = `
            SELECT p.*, u.telegram_id as customer_telegram_id, u.username as customer_username
            FROM projects p
            JOIN users u ON p.customer_id = u.id
            WHERE p.id = $1
        `;
        
        try {
            const result = await pool.query(query, [id]);
            return result.rows[0] || null;
        } catch (error) {
            throw new Error(`Error finding project: ${error.message}`);
        }
    }

    static async findByCustomerId(customerId) {
        const query = 'SELECT * FROM projects WHERE customer_id = $1 ORDER BY created_at DESC';
        
        try {
            const result = await pool.query(query, [customerId]);
            return result.rows;
        } catch (error) {
            throw new Error(`Error finding projects by customer: ${error.message}`);
        }
    }

    static async findByMemberId(userId) {
        const query = `
            SELECT p.*, pm.role as member_role
            FROM projects p
            JOIN project_members pm ON p.id = pm.project_id
            WHERE pm.user_id = $1
            ORDER BY p.created_at DESC
        `;
        
        try {
            const result = await pool.query(query, [userId]);
            return result.rows;
        } catch (error) {
            throw new Error(`Error finding projects by member: ${error.message}`);
        }
    }

    static async updateStatus(id, status) {
        const query = 'UPDATE projects SET status = $1 WHERE id = $2 RETURNING *';
        
        try {
            const result = await pool.query(query, [status, id]);
            return result.rows[0];
        } catch (error) {
            throw new Error(`Error updating project status: ${error.message}`);
        }
    }

    static async addMember(projectId, userId, role) {
        const query = `
            INSERT INTO project_members (project_id, user_id, role)
            VALUES ($1, $2, $3)
            ON CONFLICT (project_id, user_id) DO UPDATE SET role = $3
            RETURNING *
        `;
        
        try {
            const result = await pool.query(query, [projectId, userId, role]);
            return result.rows[0];
        } catch (error) {
            throw new Error(`Error adding project member: ${error.message}`);
        }
    }

    static async removeMember(projectId, userId) {
        const query = 'DELETE FROM project_members WHERE project_id = $1 AND user_id = $2';
        
        try {
            await pool.query(query, [projectId, userId]);
            return true;
        } catch (error) {
            throw new Error(`Error removing project member: ${error.message}`);
        }
    }

    static async getMembers(projectId) {
        const query = `
            SELECT u.*, pm.role as member_role, pm.joined_at
            FROM project_members pm
            JOIN users u ON pm.user_id = u.id
            WHERE pm.project_id = $1
        `;
        
        try {
            const result = await pool.query(query, [projectId]);
            return result.rows;
        } catch (error) {
            throw new Error(`Error getting project members: ${error.message}`);
        }
    }

    static async getAllActive() {
        const query = `
            SELECT p.*, u.username as customer_username
            FROM projects p
            JOIN users u ON p.customer_id = u.id
            WHERE p.status = 'active'
            ORDER BY p.created_at DESC
        `;
        
        try {
            const result = await pool.query(query);
            return result.rows;
        } catch (error) {
            throw new Error(`Error getting active projects: ${error.message}`);
        }
    }

    // Проверить, является ли пользователь владельцем (заказчиком) проекта
    static async isOwner(telegramId, projectId) {
        const query = `
            SELECT p.id
            FROM projects p
            JOIN users u ON p.customer_id = u.id
            WHERE p.id = $1 AND u.telegram_id = $2
        `;
        try {
            const result = await pool.query(query, [projectId, telegramId]);
            return result.rows.length > 0;
        } catch (error) {
            throw new Error(`Error checking project owner: ${error.message}`);
        }
    }

    // Передать права заказчика другому пользователю по username
    static async transferOwnership(projectId, newOwnerUsername) {
        // Найти пользователя по username
        const userQuery = 'SELECT id FROM users WHERE username = $1';
        let userId;
        try {
            const userResult = await pool.query(userQuery, [newOwnerUsername.replace(/^@/, '')]);
            if (userResult.rows.length === 0) {
                throw new Error('Пользователь не найден');
            }
            userId = userResult.rows[0].id;
        } catch (error) {
            throw new Error(`Ошибка поиска пользователя: ${error.message}`);
        }
        // Обновить заказчика в проекте
        const updateQuery = 'UPDATE projects SET customer_id = $1 WHERE id = $2';
        try {
            await pool.query(updateQuery, [userId, projectId]);
        } catch (error) {
            throw new Error(`Ошибка передачи прав заказчика: ${error.message}`);
        }
        // Добавляем пользователя как менеджера в project_members (если его там нет)
        const pmInsert = `
            INSERT INTO project_members (user_id, project_id, role)
            VALUES ($1, $2, 'manager')
            ON CONFLICT (project_id, user_id) DO UPDATE SET role = 'manager'
        `;
        try {
            await pool.query(pmInsert, [userId, projectId]);
        } catch (error) {
            throw new Error(`Ошибка обновления project_members: ${error.message}`);
        }
    }

    // Добавить пользователя в project_members
    static async addUserToProjectRoles(userId, projectId, role) {
        // Пропускаем роль 'customer' так как она хранится в projects.customer_id
        if (role === 'customer') {
            return;
        }
        
        const query = `
            INSERT INTO project_members (user_id, project_id, role)
            VALUES ($1, $2, $3)
            ON CONFLICT (project_id, user_id) DO UPDATE SET role = $3
        `;
        try {
            await pool.query(query, [userId, projectId, role]);
        } catch (error) {
            throw new Error(`Error adding user to project roles: ${error.message}`);
        }
    }

    // Удалить пользователя из ролей проекта
    static async removeUserFromProjectRoles(userId, projectId, role) {
        const query = `
            DELETE FROM project_members 
            WHERE user_id = $1 AND project_id = $2 AND role = $3
        `;
        try {
            await pool.query(query, [userId, projectId, role]);
        } catch (error) {
            throw new Error(`Error removing user from project roles: ${error.message}`);
        }
    }

    // Удаление проекта (только для заказчика)
    static async delete(projectId, customerId) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            // Удаляем всех project_managers для этого проекта
            await client.query('DELETE FROM project_managers WHERE project_id = $1', [projectId]);
            // Проверяем, что проект существует и принадлежит заказчику
            const projectCheck = await client.query(
                'SELECT id, status FROM projects WHERE id = $1 AND customer_id = $2',
                [projectId, customerId]
            );
            if (projectCheck.rows.length === 0) {
                await client.query('ROLLBACK');
                return false;
            }
            // Удаляем сам проект
            await client.query('DELETE FROM projects WHERE id = $1', [projectId]);
            await client.query('COMMIT');
            return true;
        } catch (error) {
            await client.query('ROLLBACK');
            throw new Error(`Error deleting project: ${error.message}`);
        } finally {
            client.release();
        }
    }

    // Найти проекты, где менеджер не участвует и не откликался
    static async findAvailableForManager(managerId) {
        const query = `
            SELECT p.* FROM projects p
            WHERE p.status = 'draft'
            AND p.id NOT IN (
                SELECT project_id FROM project_managers WHERE manager_id = $1
            )
            AND p.id NOT IN (
                SELECT project_id FROM project_members WHERE user_id = $1
            )
            ORDER BY p.created_at DESC
        `;
        const result = await pool.query(query, [managerId]);
        return result.rows;
    }

    // Перевести проект в статус 'active', если есть менеджер и хотя бы один исполнитель
    static async checkAndActivateProject(projectId) {
        // Проверяем наличие менеджера (accepted)
        const managerRes = await pool.query('SELECT 1 FROM project_managers WHERE project_id = $1 AND status = $2', [projectId, 'accepted']);
        if (managerRes.rowCount === 0) return false;
        // Проверяем наличие хотя бы одного исполнителя
        const execRes = await pool.query('SELECT 1 FROM project_members WHERE project_id = $1 AND role = $2', [projectId, 'executor']);
        if (execRes.rowCount === 0) return false;
        // Переводим проект в статус 'active'
        await pool.query('UPDATE projects SET status = $1 WHERE id = $2', ['active', projectId]);
        return true;
    }

    static async findByManagerId(userId) {
        const query = `
            SELECT p.*, pm.status as manager_status
            FROM projects p
            JOIN project_managers pm ON p.id = pm.project_id
            WHERE pm.manager_id = $1 AND pm.status IN ('accepted', 'pending')
            ORDER BY p.created_at DESC
        `;
        try {
            const result = await pool.query(query, [userId]);
            return result.rows;
        } catch (error) {
            throw new Error(`Error finding projects by manager: ${error.message}`);
        }
    }
}

module.exports = Project; 