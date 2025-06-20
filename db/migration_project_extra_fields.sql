-- Миграция: дополнительные поля для проектов
ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS deadline VARCHAR(100),
    ADD COLUMN IF NOT EXISTS budget VARCHAR(100),
    ADD COLUMN IF NOT EXISTS manager_requirements TEXT,
    ADD COLUMN IF NOT EXISTS work_conditions TEXT,
    ADD COLUMN IF NOT EXISTS additional_notes TEXT; 