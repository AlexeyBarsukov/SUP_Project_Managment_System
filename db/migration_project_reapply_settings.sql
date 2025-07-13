-- Миграция для добавления настроек повторных откликов
-- Добавляем поле allow_reapply в таблицу projects
ALTER TABLE projects ADD COLUMN allow_reapply BOOLEAN DEFAULT true;

-- Добавляем поле rejected_at в таблицу executor_applications
ALTER TABLE executor_applications ADD COLUMN rejected_at TIMESTAMP;

-- Обновляем существующие отклоненные заявки, устанавливая rejected_at
UPDATE executor_applications 
SET rejected_at = updated_at 
WHERE status = 'declined' AND rejected_at IS NULL;

-- Создаем индекс для быстрого поиска заявок по пользователю и проекту
CREATE INDEX IF NOT EXISTS idx_executor_applications_user_project 
ON executor_applications (executor_id, project_id);

-- Создаем индекс для поиска отклоненных заявок
CREATE INDEX IF NOT EXISTS idx_executor_applications_rejected 
ON executor_applications (executor_id, project_id, status) 
WHERE status = 'declined'; 