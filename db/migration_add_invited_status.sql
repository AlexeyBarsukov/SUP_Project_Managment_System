-- Миграция: добавление статуса 'invited' для приглашений от менеджеров
-- Дата: 2025-01-07
-- Описание: Добавляем статус 'invited' для приглашений от менеджеров исполнителям

-- Удаляем старый check constraint
ALTER TABLE executor_applications DROP CONSTRAINT IF EXISTS executor_applications_status_check;

-- Добавляем новый check constraint с включением статуса 'invited'
ALTER TABLE executor_applications ADD CONSTRAINT executor_applications_status_check 
    CHECK (status IN ('pending', 'invited', 'accepted', 'declined'));

-- Комментарий к таблице для документации
COMMENT ON COLUMN executor_applications.status IS 'Статус отклика: pending - ожидает рассмотрения, invited - приглашение от менеджера, accepted - принят, declined - отклонен'; 