-- Миграция для добавления ON DELETE CASCADE
-- Выполните этот скрипт для обновления существующих таблиц

-- Удаляем существующие внешние ключи (если они существуют)
ALTER TABLE IF EXISTS audit_log DROP CONSTRAINT IF EXISTS audit_log_project_id_fkey;
ALTER TABLE IF EXISTS audit_log DROP CONSTRAINT IF EXISTS audit_log_user_id_fkey;
ALTER TABLE IF EXISTS project_members DROP CONSTRAINT IF EXISTS project_members_project_id_fkey;
ALTER TABLE IF EXISTS project_members DROP CONSTRAINT IF EXISTS project_members_user_id_fkey;

-- Добавляем новые внешние ключи с ON DELETE CASCADE
ALTER TABLE audit_log 
ADD CONSTRAINT audit_log_project_id_fkey 
FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE audit_log 
ADD CONSTRAINT audit_log_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE project_members 
ADD CONSTRAINT project_members_project_id_fkey 
FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE project_members 
ADD CONSTRAINT project_members_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- Проверяем, что миграция прошла успешно
SELECT 
    tc.table_name, 
    tc.constraint_name, 
    tc.constraint_type,
    rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.referential_constraints rc 
    ON tc.constraint_name = rc.constraint_name
WHERE tc.table_name IN ('audit_log', 'project_members')
    AND tc.constraint_type = 'FOREIGN KEY'; 