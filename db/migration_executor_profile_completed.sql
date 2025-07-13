-- Миграция: добавление поля profile_completed для отслеживания заполненности профиля исполнителя
ALTER TABLE users ADD COLUMN profile_completed BOOLEAN DEFAULT FALSE;
COMMENT ON COLUMN users.profile_completed IS 'Флаг: профиль исполнителя полностью заполнен'; 