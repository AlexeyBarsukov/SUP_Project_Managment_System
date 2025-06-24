const { Pool } = require('pg');
const pool = require('../connection');

class User {
    static async create(telegramId, username, firstName, lastName, mainRole) {
        const query = `
            INSERT INTO users (telegram_id, username, first_name, last_name, main_role)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `;
        const values = [telegramId, username, firstName, lastName, mainRole];
        
        try {
            const result = await pool.query(query, values);
            return result.rows[0];
        } catch (error) {
            throw new Error(`Error creating user: ${error.message}`);
        }
    }

    static async findByTelegramId(telegramId) {
        const query = 'SELECT * FROM users WHERE telegram_id = $1';
        
        try {
            const result = await pool.query(query, [telegramId]);
            return result.rows[0] || null;
        } catch (error) {
            throw new Error(`Error finding user: ${error.message}`);
        }
    }

    static async updateMainRole(telegramId, mainRole) {
        const query = 'UPDATE users SET main_role = $1 WHERE telegram_id = $2 RETURNING *';
        
        try {
            const result = await pool.query(query, [mainRole, telegramId]);
            return result.rows[0];
        } catch (error) {
            throw new Error(`Error updating main role: ${error.message}`);
        }
    }

    static async updateRole(telegramId, role) {
        return this.updateMainRole(telegramId, role);
    }

    static async updateVisibility(telegramId, isVisible) {
        const query = 'UPDATE users SET is_visible = $1 WHERE telegram_id = $2 RETURNING *';
        
        try {
            const result = await pool.query(query, [isVisible, telegramId]);
            return result.rows[0];
        } catch (error) {
            throw new Error(`Error updating user visibility: ${error.message}`);
        }
    }

    static async findVisibleByRole(role) {
        const query = 'SELECT * FROM users WHERE main_role = $1 AND is_visible = true';
        
        try {
            const result = await pool.query(query, [role]);
            return result.rows;
        } catch (error) {
            throw new Error(`Error finding visible users by role: ${error.message}`);
        }
    }

    static async findManagers() {
        return this.findVisibleByRole('manager');
    }

    static async findExecutors() {
        return this.findVisibleByRole('executor');
    }

    static async getProjectRoles(telegramId) {
        const query = `
            SELECT 
                CASE 
                    WHEN p.customer_id = u.id THEN 'customer'
                    ELSE pm.role
                END as role,
                p.id as project_id,
                p.name as project_name
            FROM users u
            LEFT JOIN projects p ON p.customer_id = u.id
            LEFT JOIN project_members pm ON pm.user_id = u.id AND pm.project_id = p.id
            WHERE u.telegram_id = $1 AND p.id IS NOT NULL
            
            UNION
            
            SELECT 
                pm.role,
                pm.project_id,
                p.name as project_name
            FROM users u
            JOIN project_members pm ON pm.user_id = u.id
            JOIN projects p ON p.id = pm.project_id
            WHERE u.telegram_id = $1
        `;
        try {
            const result = await pool.query(query, [telegramId]);
            return result.rows;
        } catch (error) {
            throw new Error(`Error getting project roles: ${error.message}`);
        }
    }

    static async canChangeRole(telegramId, newRole) {
        const projectRoles = await this.getProjectRoles(telegramId);
        if (projectRoles.length === 0) {
            return { canChange: true };
        }
        if (newRole === 'customer') {
            const isOwnerEverywhere = projectRoles.every(p => p.role === 'customer');
            if (!isOwnerEverywhere) {
                return {
                    canChange: false,
                    error: 'Вы должны быть заказчиком во всех своих проектах!'
                };
            }
        }
        if (projectRoles.some(p => p.role === 'customer')) {
            return {
                canChange: false,
                error: 'Сначала передайте права заказчика в проектах!'
            };
        }
        if (projectRoles.some(p => p.role === 'manager') && newRole !== 'manager') {
            const user = await this.findByTelegramId(telegramId);
            if (user) {
                const projects = await require('./Project').findByManagerId(user.id);
                const activeStatuses = ['active', 'searching_executors', 'in_progress'];
                const activeProjects = projects.filter(p => p.manager_status === 'accepted' && activeStatuses.includes(p.status));
                if (activeProjects.length > 0) {
                    const list = activeProjects.map(p => `• ${p.name} (ID: ${p.id}, статус: ${p.status})`).join('\n');
                    return {
                        canChange: false,
                        error: 'Вы не можете сменить роль, пока являетесь менеджером в следующих активных проектах:\n' + list
                    };
                }
            }
        }
        return { canChange: true };
    }

    static async findByUsername(username) {
        const query = 'SELECT * FROM users WHERE username = $1';
        try {
            const result = await pool.query(query, [username.replace(/^@/, '')]);
            return result.rows[0] || null;
        } catch (error) {
            throw new Error(`Error finding user by username: ${error.message}`);
        }
    }

    static async updateManagerProfile(telegramId, profileData) {
        const query = `
            UPDATE users 
            SET specialization = $1, experience = $2, skills = $3, 
                achievements = $4, salary_range = $5, contacts = $6
            WHERE telegram_id = $7 
            RETURNING *
        `;
        
        // Преобразуем навыки в JSON строку, если это массив
        let skillsValue = profileData.skills;
        if (Array.isArray(skillsValue)) {
            skillsValue = JSON.stringify(skillsValue);
        }
        
        const values = [
            profileData.specialization || null,
            profileData.experience || null,
            skillsValue || null,
            profileData.achievements || null,
            profileData.salary_range || null,
            profileData.contacts || null,
            telegramId
        ];
        
        try {
            const result = await pool.query(query, values);
            return result.rows[0];
        } catch (error) {
            throw new Error(`Error updating manager profile: ${error.message}`);
        }
    }

    static async getManagerProfile(telegramId) {
        const query = `
            SELECT specialization, experience, skills, achievements, salary_range, contacts
            FROM users 
            WHERE telegram_id = $1
        `;
        
        try {
            const result = await pool.query(query, [telegramId]);
            const profile = result.rows[0] || null;
            
            // Парсим навыки из JSON, если они есть
            if (profile && profile.skills) {
                try {
                    const skillsArray = JSON.parse(profile.skills);
                    if (Array.isArray(skillsArray)) {
                        profile.skills = skillsArray;
                    }
                } catch (error) {
                    // Если не удалось распарсить JSON, оставляем как есть
                    console.log('Could not parse skills JSON:', error.message);
                }
            }
            
            return profile;
        } catch (error) {
            throw new Error(`Error getting manager profile: ${error.message}`);
        }
    }

    static async findManagersWithProfiles() {
        const query = `
            SELECT id, telegram_id, username, first_name, last_name, 
                   specialization, experience, skills, achievements, salary_range, contacts
            FROM users 
            WHERE main_role = 'manager' AND is_visible = true
            ORDER BY first_name, last_name
        `;
        
        try {
            const result = await pool.query(query);
            return result.rows;
        } catch (error) {
            throw new Error(`Error finding managers with profiles: ${error.message}`);
        }
    }

    static async findById(id) {
        const query = 'SELECT * FROM users WHERE id = $1';
        try {
            const result = await pool.query(query, [id]);
            return result.rows[0] || null;
        } catch (error) {
            throw new Error(`Error finding user by id: ${error.message}`);
        }
    }

    /**
     * Обновляет одно поле профиля менеджера по telegram_id
     * @param {string|number} telegram_id
     * @param {string} field
     * @param {any} value
     */
    static async updateProfileField(telegram_id, field, value) {
        const allowedFields = ['specialization', 'experience', 'skills', 'salary_range', 'contacts'];
        if (!allowedFields.includes(field)) throw new Error('Недопустимое поле профиля');
        let val = value;
        if (field === 'skills' && Array.isArray(value)) {
            val = JSON.stringify(value);
        }
        const query = `UPDATE users SET ${field} = $1 WHERE telegram_id = $2`;
        await pool.query(query, [val, telegram_id]);
    }
}

module.exports = User; 