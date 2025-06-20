const pool = require('../connection');

class ProjectMessage {
    static async create({ project_id, sender_id, text, attachment_url = null }) {
        const query = `
            INSERT INTO project_messages (project_id, sender_id, text, attachment_url)
            VALUES ($1, $2, $3, $4) RETURNING *
        `;
        const values = [project_id, sender_id, text, attachment_url];
        const result = await pool.query(query, values);
        return result.rows[0];
    }

    static async findByProject(project_id) {
        const query = `SELECT * FROM project_messages WHERE project_id = $1 ORDER BY created_at ASC`;
        const result = await pool.query(query, [project_id]);
        return result.rows;
    }
}

module.exports = ProjectMessage; 