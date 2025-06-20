const pool = require('../connection');

class ManagerInvitation {
    static async create({ project_id, manager_telegram_id, customer_telegram_id }) {
        const query = `
            INSERT INTO manager_invitations (project_id, manager_telegram_id, customer_telegram_id)
            VALUES ($1, $2, $3) RETURNING *
        `;
        const values = [project_id, manager_telegram_id, customer_telegram_id];
        const result = await pool.query(query, values);
        return result.rows[0];
    }

    static async findPending(manager_telegram_id, project_id) {
        const query = `
            SELECT * FROM manager_invitations
            WHERE manager_telegram_id = $1 AND project_id = $2 AND status = 'pending'
        `;
        const result = await pool.query(query, [manager_telegram_id, project_id]);
        return result.rows[0];
    }

    static async updateStatus(id, status) {
        const query = `
            UPDATE manager_invitations SET status = $1 WHERE id = $2 RETURNING *
        `;
        const result = await pool.query(query, [status, id]);
        return result.rows[0];
    }

    static async findById(id) {
        const query = `SELECT * FROM manager_invitations WHERE id = $1`;
        const result = await pool.query(query, [id]);
        return result.rows[0];
    }

    static async findPendingByManager(manager_telegram_id) {
        const query = `SELECT * FROM manager_invitations WHERE manager_telegram_id = $1 AND status = 'pending'`;
        const result = await pool.query(query, [manager_telegram_id]);
        return result.rows;
    }
}

module.exports = ManagerInvitation; 