-- Миграция: Добавление уникальных индексов для ON CONFLICT
-- Дата: 2024-12-19
-- Описание: Исправляет ошибку "there is no unique or exclusion constraint matching the ON CONFLICT specification"

-- 1. Добавляем уникальный индекс для project_members
-- Это нужно для ON CONFLICT (project_id, user_id) в методе addUserToProjectRoles
CREATE UNIQUE INDEX IF NOT EXISTS project_members_project_id_user_id_idx
ON project_members (project_id, user_id);

-- 2. Добавляем уникальный индекс для project_managers  
-- Это нужно для ON CONFLICT (project_id, manager_id) в модели ProjectManager
CREATE UNIQUE INDEX IF NOT EXISTS project_managers_project_id_manager_id_idx
ON project_managers (project_id, manager_id);

-- 3. Проверяем, что индексы созданы
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE tablename IN ('project_members', 'project_managers')
AND indexname LIKE '%project_id%'
ORDER BY tablename, indexname; 