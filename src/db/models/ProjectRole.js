const { Pool } = require('pg');
const pool = require('../connection');

class ProjectRole {
    static async create(projectId, roleData) {
        const query = `
            INSERT INTO project_roles (project_id, role_name, required_skills, positions_count, salary_range, description)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `;
        const values = [
            projectId,
            roleData.role_name,
            roleData.required_skills || null,
            roleData.positions_count || 1,
            roleData.salary_range || null,
            roleData.description || null
        ];
        
        try {
            const result = await pool.query(query, values);
            return result.rows[0];
        } catch (error) {
            throw new Error(`Error creating project role: ${error.message}`);
        }
    }

    static async findByProjectId(projectId) {
        const query = `
            SELECT * FROM project_roles 
            WHERE project_id = $1 
            ORDER BY created_at ASC
        `;
        
        try {
            const result = await pool.query(query, [projectId]);
            return result.rows;
        } catch (error) {
            throw new Error(`Error finding project roles: ${error.message}`);
        }
    }

    static async findById(id) {
        const query = 'SELECT * FROM project_roles WHERE id = $1';
        
        try {
            const result = await pool.query(query, [id]);
            return result.rows[0] || null;
        } catch (error) {
            throw new Error(`Error finding project role: ${error.message}`);
        }
    }

    static async update(id, roleData) {
        const query = `
            UPDATE project_roles 
            SET role_name = $1, required_skills = $2, positions_count = $3, 
                salary_range = $4, description = $5
            WHERE id = $6
            RETURNING *
        `;
        const values = [
            roleData.role_name,
            roleData.required_skills || null,
            roleData.positions_count || 1,
            roleData.salary_range || null,
            roleData.description || null,
            id
        ];
        
        try {
            const result = await pool.query(query, values);
            return result.rows[0];
        } catch (error) {
            throw new Error(`Error updating project role: ${error.message}`);
        }
    }

    static async updateField(id, field, value) {
        const allowedFields = ['role_name', 'required_skills', 'positions_count', 'salary_range', 'description', 'skills'];
        
        if (!allowedFields.includes(field)) {
            throw new Error(`Invalid field: ${field}`);
        }

        const query = `
            UPDATE project_roles 
            SET ${field} = $1
            WHERE id = $2
            RETURNING *
        `;
        
        try {
            const result = await pool.query(query, [value, id]);
            return result.rows[0];
        } catch (error) {
            throw new Error(`Error updating project role field: ${error.message}`);
        }
    }

    static async delete(id) {
        const query = 'DELETE FROM project_roles WHERE id = $1 RETURNING *';
        
        try {
            const result = await pool.query(query, [id]);
            return result.rows[0];
        } catch (error) {
            throw new Error(`Error deleting project role: ${error.message}`);
        }
    }

    static async deleteByProjectId(projectId) {
        const query = 'DELETE FROM project_roles WHERE project_id = $1';
        
        try {
            await pool.query(query, [projectId]);
        } catch (error) {
            throw new Error(`Error deleting project roles: ${error.message}`);
        }
    }

    static async incrementFilledPositions(id) {
        const query = `
            UPDATE project_roles 
            SET filled_positions = filled_positions + 1
            WHERE id = $1 AND filled_positions < positions_count
            RETURNING *
        `;
        
        try {
            const result = await pool.query(query, [id]);
            return result.rows[0];
        } catch (error) {
            throw new Error(`Error incrementing filled positions: ${error.message}`);
        }
    }

    static async decrementFilledPositions(id) {
        const query = `
            UPDATE project_roles 
            SET filled_positions = GREATEST(filled_positions - 1, 0)
            WHERE id = $1
            RETURNING *
        `;
        
        try {
            const result = await pool.query(query, [id]);
            return result.rows[0];
        } catch (error) {
            throw new Error(`Error decrementing filled positions: ${error.message}`);
        }
    }

    static async getAvailablePositions(projectId) {
        const query = `
            SELECT 
                id,
                role_name,
                positions_count,
                filled_positions,
                (positions_count - filled_positions) as available_positions
            FROM project_roles 
            WHERE project_id = $1 AND filled_positions < positions_count
            ORDER BY created_at ASC
        `;
        
        try {
            const result = await pool.query(query, [projectId]);
            return result.rows;
        } catch (error) {
            throw new Error(`Error getting available positions: ${error.message}`);
        }
    }

    static async isProjectFullyStaffed(projectId) {
        const query = `
            SELECT COUNT(*) as total_roles,
                   SUM(CASE WHEN filled_positions >= positions_count THEN 1 ELSE 0 END) as filled_roles
            FROM project_roles 
            WHERE project_id = $1
        `;
        
        try {
            const result = await pool.query(query, [projectId]);
            const { total_roles, filled_roles } = result.rows[0];
            return total_roles > 0 && total_roles == filled_roles;
        } catch (error) {
            throw new Error(`Error checking project staffing: ${error.message}`);
        }
    }

    // Получить исполнителей по конкретной роли
    static async getExecutors(roleId) {
        const query = `
            SELECT u.*
            FROM project_members pm
            JOIN users u ON pm.user_id = u.id
            WHERE pm.role_id = $1 AND pm.role = 'executor'
        `;
        const result = await pool.query(query, [roleId]);
        return result.rows;
    }

    // Исправить неправильные значения filled_positions
    static async fixFilledPositions() {
        // Сбросить filled_positions в 0 для всех ролей
        await pool.query('UPDATE project_roles SET filled_positions = 0');
        // Затем выставить актуальное значение для тех, где есть принятые исполнители
        const query = `
            UPDATE project_roles 
            SET filled_positions = (
                SELECT COUNT(*)
                FROM executor_applications ea
                WHERE ea.role_id = project_roles.id 
                AND ea.status = 'accepted'
            )
            WHERE id IN (
                SELECT DISTINCT role_id 
                FROM executor_applications 
                WHERE status = 'accepted'
            )
        `;
        
        try {
            const result = await pool.query(query);
            return result.rowCount;
        } catch (error) {
            throw new Error(`Error fixing filled positions: ${error.message}`);
        }
    }
}

module.exports = ProjectRole; 