-- Миграция: дополнительные поля для проектов
ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS deadline VARCHAR(100),
    ADD COLUMN IF NOT EXISTS budget VARCHAR(100),
    ADD COLUMN IF NOT EXISTS manager_requirements TEXT,
    ADD COLUMN IF NOT EXISTS work_conditions TEXT,
    ADD COLUMN IF NOT EXISTS additional_notes TEXT;

-- Добавляем уникальный индекс для предотвращения дубликатов менеджеров
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_managers_unique 
ON project_managers (project_id, manager_id); 