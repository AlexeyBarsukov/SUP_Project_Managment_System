const pool = require('../connection');

class ExecutorApplication {
    /**
     * Создает новый отклик исполнителя на роль в проекте
     */
    static async create({ project_id, role_id, executor_id, cover_letter = null }) {
        const query = `
            INSERT INTO executor_applications (project_id, role_id, executor_id, cover_letter)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (project_id, role_id, executor_id) DO UPDATE SET 
                cover_letter = $4,
                updated_at = CURRENT_TIMESTAMP
            RETURNING *
        `;
        
        try {
            const result = await pool.query(query, [project_id, role_id, executor_id, cover_letter]);
            return result.rows[0];
        } catch (error) {
            throw new Error(`Error creating executor application: ${error.message}`);
        }
    }

    /**
     * Получает отклик по ID
     */
    static async findById(id) {
        const query = `
            SELECT ea.*, u.first_name, u.last_name, u.username, u.specialization, u.skills,
                   pr.role_name, pr.required_skills, pr.salary_range, pr.description,
                   p.name as project_name
            FROM executor_applications ea
            JOIN users u ON ea.executor_id = u.id
            JOIN project_roles pr ON ea.role_id = pr.id
            JOIN projects p ON ea.project_id = p.id
            WHERE ea.id = $1
        `;
        
        try {
            const result = await pool.query(query, [id]);
            return result.rows[0] || null;
        } catch (error) {
            throw new Error(`Error finding application by id: ${error.message}`);
        }
    }

    /**
     * Получает все отклики на проект с информацией об исполнителях и ролях
     */
    static async findByProject(project_id) {
        const query = `
            SELECT ea.*, u.first_name, u.last_name, u.username, u.specialization, u.skills, u.contacts,
                   pr.role_name, pr.required_skills, pr.salary_range, pr.description,
                   pr.positions_count, pr.filled_positions, p.name as project_name
            FROM executor_applications ea
            JOIN users u ON ea.executor_id = u.id
            JOIN project_roles pr ON ea.role_id = pr.id
            JOIN projects p ON ea.project_id = p.id
            WHERE ea.project_id = $1
            ORDER BY ea.created_at DESC
        `;
        
        try {
            const result = await pool.query(query, [project_id]);
            return result.rows;
        } catch (error) {
            throw new Error(`Error finding applications by project: ${error.message}`);
        }
    }

    /**
     * Получает отклики на конкретную роль в проекте
     */
    static async findByRole(role_id) {
        const query = `
            SELECT ea.*, u.first_name, u.last_name, u.username, u.specialization, u.skills, u.contacts
            FROM executor_applications ea
            JOIN users u ON ea.executor_id = u.id
            WHERE ea.role_id = $1
            ORDER BY ea.created_at DESC
        `;
        
        try {
            const result = await pool.query(query, [role_id]);
            return result.rows;
        } catch (error) {
            throw new Error(`Error finding applications by role: ${error.message}`);
        }
    }

    /**
     * Получает отклики исполнителя
     */
    static async findByExecutor(executor_id) {
        const query = `
            SELECT ea.*, pr.role_name, pr.required_skills, pr.salary_range, pr.description,
                   p.name as project_name, p.status as project_status
            FROM executor_applications ea
            JOIN project_roles pr ON ea.role_id = pr.id
            JOIN projects p ON ea.project_id = p.id
            WHERE ea.executor_id = $1
            ORDER BY ea.created_at DESC
        `;
        
        try {
            const result = await pool.query(query, [executor_id]);
            return result.rows;
        } catch (error) {
            throw new Error(`Error finding applications by executor: ${error.message}`);
        }
    }

    /**
     * Получает принятые отклики для конкретной роли
     */
    static async findAcceptedByRoleId(role_id) {
        const query = `
            SELECT ea.*, u.first_name, u.last_name, u.username
            FROM executor_applications ea
            JOIN users u ON ea.executor_id = u.id
            WHERE ea.role_id = $1 AND ea.status = 'accepted'
            ORDER BY ea.created_at ASC
        `;
        
        try {
            const result = await pool.query(query, [role_id]);
            return result.rows;
        } catch (error) {
            throw new Error(`Error finding accepted applications by role: ${error.message}`);
        }
    }

    /**
     * Обновляет статус отклика
     */
    static async updateStatus(id, status) {
        const query = `
            UPDATE executor_applications 
            SET status = $1, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
            RETURNING *
        `;
        
        try {
            const result = await pool.query(query, [status, id]);
            return result.rows[0];
        } catch (error) {
            throw new Error(`Error updating application status: ${error.message}`);
        }
    }

    /**
     * Принимает отклик и добавляет исполнителя в проект
     */
    static async accept(id) {
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            
            // Получаем информацию об отклике
            const applicationQuery = `
                SELECT ea.*, pr.role_name, p.name as project_name
                FROM executor_applications ea
                JOIN project_roles pr ON ea.role_id = pr.id
                JOIN projects p ON ea.project_id = p.id
                WHERE ea.id = $1
            `;
            const appResult = await client.query(applicationQuery, [id]);
            const application = appResult.rows[0];
            
            if (!application) {
                throw new Error('Application not found');
            }
            
            if (application.status !== 'pending') {
                throw new Error('Application is not pending');
            }
            
            // Проверяем, был ли исполнитель уже в проекте
            const memberCheckQuery = `
                SELECT 1 FROM project_members 
                WHERE project_id = $1 AND user_id = $2 AND role = 'executor'
            `;
            const memberResult = await client.query(memberCheckQuery, [application.project_id, application.executor_id]);
            const wasAlreadyMember = memberResult.rows.length > 0;
            
            // Проверяем, есть ли свободные позиции ПЕРЕД обновлением статуса
            console.log('DEBUG: About to check role with ID:', application.role_id);
            const roleQuery = 'SELECT positions_count, filled_positions FROM project_roles WHERE id = $1';
            const roleResult = await client.query(roleQuery, [application.role_id]);
            const role = roleResult.rows[0];
            
            console.log('DEBUG: Raw role data:', role);
            console.log('DEBUG: Role check:', {
                roleId: application.role_id,
                positionsCount: role.positions_count,
                filledPositions: role.filled_positions,
                filledPositionsType: typeof role.filled_positions,
                condition: `${role.filled_positions} >= ${role.positions_count}`,
                result: role.filled_positions >= role.positions_count
            });
            
            if (role.filled_positions >= role.positions_count) {
                throw new Error('Все позиции для этой роли уже заполнены');
            }
            
            // Обновляем статус отклика
            await client.query(
                'UPDATE executor_applications SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                ['accepted', id]
            );
            
            // Добавляем исполнителя в проект (если его там еще нет)
            if (!wasAlreadyMember) {
                await client.query(
                    'INSERT INTO project_members (project_id, user_id, role, role_id) VALUES ($1, $2, $3, $4)',
                    [application.project_id, application.executor_id, 'executor', application.role_id]
                );
            }
            
            // filled_positions автоматически увеличивается триггером при обновлении статуса
            
            await client.query('COMMIT');
            
            return application;
        } catch (error) {
            await client.query('ROLLBACK');
            throw new Error(`Error accepting application: ${error.message}`);
        } finally {
            client.release();
        }
    }

    /**
     * Отклоняет отклик
     */
    static async decline(id) {
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            
            // Получаем информацию об отклике
            const applicationQuery = `
                SELECT ea.*, pr.role_name, p.name as project_name
                FROM executor_applications ea
                JOIN project_roles pr ON ea.role_id = pr.id
                JOIN projects p ON ea.project_id = p.id
                WHERE ea.id = $1
            `;
            const appResult = await client.query(applicationQuery, [id]);
            const application = appResult.rows[0];
            
            if (!application) {
                throw new Error('Application not found');
            }
            
            if (application.status !== 'pending') {
                throw new Error('Application is not pending');
            }
            
            // Проверяем, есть ли исполнитель в project_members
            const memberQuery = `
                SELECT 1 FROM project_members 
                WHERE project_id = $1 AND user_id = $2 AND role = $3
            `;
            const memberResult = await client.query(memberQuery, [
                application.project_id, 
                application.executor_id, 
                'executor'
            ]);
            const wasMember = memberResult.rows.length > 0;
            
            // Обновляем статус отклика
            await client.query(
                'UPDATE executor_applications SET status = $1, updated_at = CURRENT_TIMESTAMP, rejected_at = CURRENT_TIMESTAMP WHERE id = $2',
                ['declined', id]
            );
            
            // Если исполнитель был в project_members, удаляем его
            if (wasMember) {
                await client.query(
                    'DELETE FROM project_members WHERE project_id = $1 AND user_id = $2 AND role = $3',
                    [application.project_id, application.executor_id, 'executor']
                );
            }
            
            // filled_positions автоматически уменьшается триггером при обновлении статуса
            
            await client.query('COMMIT');
            
            return application;
        } catch (error) {
            await client.query('ROLLBACK');
            throw new Error(`Error declining application: ${error.message}`);
        } finally {
            client.release();
        }
    }

    /**
     * Проверяет, может ли исполнитель откликнуться на роль
     */
    static async canApply(project_id, role_id, executor_id) {
        const query = `
            SELECT 1 FROM executor_applications 
            WHERE project_id = $1 AND role_id = $2 AND executor_id = $3
        `;
        
        try {
            const result = await pool.query(query, [project_id, role_id, executor_id]);
            return result.rows.length === 0; // Может откликнуться, если еще не откликался
        } catch (error) {
            throw new Error(`Error checking application possibility: ${error.message}`);
        }
    }

    /**
     * Получает количество откликов по статусам для проекта
     */
    static async getApplicationStats(project_id) {
        const query = `
            SELECT status, COUNT(*) as count
            FROM executor_applications
            WHERE project_id = $1
            GROUP BY status
        `;
        
        try {
            const result = await pool.query(query, [project_id]);
            const stats = { pending: 0, accepted: 0, declined: 0 };
            
            result.rows.forEach(row => {
                stats[row.status] = parseInt(row.count);
            });
            
            return stats;
        } catch (error) {
            throw new Error(`Error getting application stats: ${error.message}`);
        }
    }

    /**
     * Удаляет отклик
     */
    static async delete(id) {
        const query = 'DELETE FROM executor_applications WHERE id = $1 RETURNING *';
        
        try {
            const result = await pool.query(query, [id]);
            return result.rows[0];
        } catch (error) {
            throw new Error(`Error deleting application: ${error.message}`);
        }
    }

    /**
     * Получает статус заявки исполнителя на конкретную роль
     */
    static async getExecutorApplicationStatus(projectId, roleId, executorId) {
        const query = `
            SELECT ea.status, ea.created_at, ea.rejected_at, pr.role_name
            FROM executor_applications ea
            JOIN project_roles pr ON ea.role_id = pr.id
            WHERE ea.project_id = $1 AND ea.role_id = $2 AND ea.executor_id = $3
            ORDER BY ea.created_at DESC
            LIMIT 1
        `;
        
        try {
            const result = await pool.query(query, [projectId, roleId, executorId]);
            return result.rows[0] || null;
        } catch (error) {
            throw new Error(`Error getting application status: ${error.message}`);
        }
    }

    /**
     * Получает все заявки исполнителя на проект
     */
    static async getExecutorApplicationsForProject(projectId, executorId) {
        const query = `
            SELECT ea.status, ea.created_at, ea.rejected_at, pr.role_name, pr.id as role_id
            FROM executor_applications ea
            JOIN project_roles pr ON ea.role_id = pr.id
            WHERE ea.project_id = $1 AND ea.executor_id = $2
            ORDER BY ea.created_at DESC
        `;
        
        try {
            const result = await pool.query(query, [projectId, executorId]);
            return result.rows;
        } catch (error) {
            throw new Error(`Error getting executor applications for project: ${error.message}`);
        }
    }
}

module.exports = ExecutorApplication; 