const pool = require('../connection');

class ProjectManager {
    static async create({ project_id, manager_id, status = 'pending', offer = null }) {
        const query = `
            INSERT INTO project_managers (project_id, manager_id, status, offer)
            VALUES ($1, $2, $3, $4) RETURNING *
        `;
        const values = [project_id, manager_id, status, offer];
        const result = await pool.query(query, values);
        return result.rows[0];
    }

    static async findByProjectAndManager(project_id, manager_id) {
        const query = `SELECT * FROM project_managers WHERE project_id = $1 AND manager_id = $2`;
        const result = await pool.query(query, [project_id, manager_id]);
        return result.rows[0];
    }

    static async updateStatus(id, status, offer = null) {
        const query = `UPDATE project_managers SET status = $1, offer = $2 WHERE id = $3 RETURNING *`;
        const result = await pool.query(query, [status, offer, id]);
        return result.rows[0];
    }

    static async findByProject(project_id) {
        const query = `SELECT * FROM project_managers WHERE project_id = $1`;
        const result = await pool.query(query, [project_id]);
        return result.rows;
    }

    static async findByManager(manager_id) {
        const query = `SELECT * FROM project_managers WHERE manager_id = $1`;
        const result = await pool.query(query, [manager_id]);
        return result.rows;
    }

    static async activateChat(id) {
        const query = `UPDATE project_managers SET is_chat_active = true WHERE id = $1 RETURNING *`;
        const result = await pool.query(query, [id]);
        return result.rows[0];
    }

    static async findActiveChat(project_id, user_id) {
        const query = `SELECT * FROM project_managers WHERE project_id = $1 AND (manager_id = $2 OR (SELECT customer_id FROM projects WHERE id = $1) = $2) AND is_chat_active = true`;
        const result = await pool.query(query, [project_id, user_id]);
        return result.rows[0];
    }
}

module.exports = ProjectManager; 