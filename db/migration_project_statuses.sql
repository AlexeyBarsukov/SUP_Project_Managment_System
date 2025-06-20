-- Миграция: расширение допустимых статусов проекта
ALTER TABLE projects
    DROP CONSTRAINT IF EXISTS projects_status_check;

ALTER TABLE projects
    ADD CONSTRAINT projects_status_check
    CHECK (status IN (
        'draft',
        'active',
        'archived',
        'searching_manager',
        'searching_executors',
        'in_progress'
    )); 