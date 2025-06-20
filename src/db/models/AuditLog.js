const pool = require('../connection');

class AuditLog {
    static async create(userId, action, projectId = null, details = null) {
        const query = `
            INSERT INTO audit_log (user_id, action, project_id, details)
            VALUES ($1, $2, $3, $4)
            RETURNING *
        `;
        const values = [userId, action, projectId, details];
        
        try {
            const result = await pool.query(query, values);
            return result.rows[0];
        } catch (error) {
            throw new Error(`Error creating audit log: ${error.message}`);
        }
    }

    static async findByProjectId(projectId, limit = 50) {
        const query = `
            SELECT al.*, u.username, u.first_name, u.last_name
            FROM audit_log al
            LEFT JOIN users u ON al.user_id = u.id
            WHERE al.project_id = $1
            ORDER BY al.timestamp DESC
            LIMIT $2
        `;
        
        try {
            const result = await pool.query(query, [projectId, limit]);
            return result.rows;
        } catch (error) {
            throw new Error(`Error finding audit logs by project: ${error.message}`);
        }
    }

    static async findByUserId(userId, limit = 50) {
        const query = `
            SELECT al.*, p.name as project_name
            FROM audit_log al
            LEFT JOIN projects p ON al.project_id = p.id
            WHERE al.user_id = $1
            ORDER BY al.timestamp DESC
            LIMIT $2
        `;
        
        try {
            const result = await pool.query(query, [userId, limit]);
            return result.rows;
        } catch (error) {
            throw new Error(`Error finding audit logs by user: ${error.message}`);
        }
    }

    static async getRecent(limit = 100) {
        const query = `
            SELECT al.*, u.username, u.first_name, u.last_name, p.name as project_name
            FROM audit_log al
            LEFT JOIN users u ON al.user_id = u.id
            LEFT JOIN projects p ON al.project_id = p.id
            ORDER BY al.timestamp DESC
            LIMIT $1
        `;
        
        try {
            const result = await pool.query(query, [limit]);
            return result.rows;
        } catch (error) {
            throw new Error(`Error getting recent audit logs: ${error.message}`);
        }
    }

    // Статические методы для логирования конкретных действий
    static async logProjectCreated(userId, projectId, projectName) {
        return this.create(userId, 'PROJECT_CREATED', projectId, { project_name: projectName });
    }

    static async logProjectStatusChanged(userId, projectId, oldStatus, newStatus) {
        return this.create(userId, 'PROJECT_STATUS_CHANGED', projectId, { 
            old_status: oldStatus, 
            new_status: newStatus 
        });
    }

    static async logMemberAdded(userId, projectId, memberId, role) {
        return this.create(userId, 'MEMBER_ADDED', projectId, { 
            member_id: memberId, 
            role: role 
        });
    }

    static async logMemberRemoved(userId, projectId, memberId) {
        return this.create(userId, 'MEMBER_REMOVED', projectId, { 
            member_id: memberId 
        });
    }

    static async logRoleChanged(userId, oldRole, newRole) {
        return this.create(userId, 'ROLE_CHANGED', null, { 
            old_role: oldRole, 
            new_role: newRole 
        });
    }

    static async logJoinRequest(userId, projectId) {
        return this.create(userId, 'JOIN_REQUEST', projectId);
    }

    static async logProjectDeleted(userId, projectId, projectName) {
        return this.create(userId, 'PROJECT_DELETED', projectId, { project_name: projectName });
    }
}

module.exports = AuditLog; 