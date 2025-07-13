-- Миграция: добавление поля role_id в таблицу project_members
-- Дата: 2025-01-07
-- Описание: Добавляем связь между участниками проекта и конкретными ролями

-- Добавляем поле role_id в таблицу project_members
ALTER TABLE project_members ADD COLUMN IF NOT EXISTS role_id INTEGER REFERENCES project_roles(id) ON DELETE SET NULL;

-- Создаем индекс для оптимизации
CREATE INDEX IF NOT EXISTS idx_project_members_role_id ON project_members(role_id);

-- Обновляем существующие записи (если есть)
-- Для исполнителей устанавливаем role_id на основе их заявок
UPDATE project_members 
SET role_id = (
    SELECT ea.role_id 
    FROM executor_applications ea 
    WHERE ea.executor_id = project_members.user_id 
    AND ea.project_id = project_members.project_id 
    AND ea.status = 'accepted'
    LIMIT 1
)
WHERE project_members.role = 'executor' 
AND project_members.role_id IS NULL; 