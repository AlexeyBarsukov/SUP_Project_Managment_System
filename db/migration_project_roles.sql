-- Миграция: создание таблицы ролей проекта
CREATE TABLE IF NOT EXISTS project_roles (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    role_name VARCHAR(100) NOT NULL,
    required_skills TEXT,
    positions_count INTEGER DEFAULT 1,
    filled_positions INTEGER DEFAULT 0,
    salary_range VARCHAR(100),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Создание индексов для оптимизации
CREATE INDEX IF NOT EXISTS idx_project_roles_project_id ON project_roles(project_id);
CREATE INDEX IF NOT EXISTS idx_project_roles_role_name ON project_roles(role_name);

-- Триггер для автоматического обновления updated_at
CREATE TRIGGER update_project_roles_updated_at BEFORE UPDATE ON project_roles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Добавляем поле для контактов менеджера в projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS manager_contacts_visible BOOLEAN DEFAULT false; 