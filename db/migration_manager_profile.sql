-- Миграция для добавления полей профиля менеджера
-- Добавляем новые поля в таблицу users

ALTER TABLE users ADD COLUMN IF NOT EXISTS specialization VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS experience TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS skills TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS achievements TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS salary_range VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS contacts VARCHAR(100);

-- Добавляем комментарии к полям
COMMENT ON COLUMN users.specialization IS 'Специализация менеджера';
COMMENT ON COLUMN users.experience IS 'Опыт работы менеджера';
COMMENT ON COLUMN users.skills IS 'Навыки менеджера';
COMMENT ON COLUMN users.achievements IS 'Достижения менеджера';
COMMENT ON COLUMN users.salary_range IS 'Зарплатные ожидания менеджера';
COMMENT ON COLUMN users.contacts IS 'Контактная информация менеджера';

-- Таблица для хранения приглашений менеджеров в проекты
CREATE TABLE IF NOT EXISTS manager_invitations (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL,
    manager_telegram_id BIGINT NOT NULL,
    customer_telegram_id BIGINT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending', -- pending, accepted, declined
    created_at TIMESTAMP DEFAULT NOW()
);

-- Таблица для связи проектов и менеджеров (отклики, статусы, условия)
CREATE TABLE IF NOT EXISTS project_managers (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    manager_id INTEGER NOT NULL REFERENCES users(id),
    status VARCHAR(20) DEFAULT 'pending', -- pending, accepted, declined, negotiating
    offer TEXT, -- условия, если были предложены изменения
    created_at TIMESTAMP DEFAULT NOW()
);

-- Таблица для сообщений внутри проекта
CREATE TABLE IF NOT EXISTS project_messages (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    sender_id INTEGER NOT NULL REFERENCES users(id),
    text TEXT,
    attachment_url TEXT,
    created_at TIMESTAMP DEFAULT NOW()
); 