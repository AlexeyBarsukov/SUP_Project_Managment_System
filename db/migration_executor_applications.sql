-- Миграция: создание таблицы откликов исполнителей на проекты
-- Дата: 2025-01-07
-- Описание: Система откликов исполнителей с уведомлениями для менеджеров

-- Таблица откликов исполнителей на роли в проектах
CREATE TABLE IF NOT EXISTS executor_applications (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    role_id INTEGER NOT NULL REFERENCES project_roles(id) ON DELETE CASCADE,
    executor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
    cover_letter TEXT, -- сопроводительное письмо
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, role_id, executor_id) -- один исполнитель может откликнуться только один раз на одну роль
);

-- Индексы для оптимизации
CREATE INDEX IF NOT EXISTS idx_executor_applications_project_id ON executor_applications(project_id);
CREATE INDEX IF NOT EXISTS idx_executor_applications_role_id ON executor_applications(role_id);
CREATE INDEX IF NOT EXISTS idx_executor_applications_executor_id ON executor_applications(executor_id);
CREATE INDEX IF NOT EXISTS idx_executor_applications_status ON executor_applications(status);

-- Триггер для автоматического обновления updated_at
CREATE TRIGGER update_executor_applications_updated_at BEFORE UPDATE ON executor_applications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Добавляем поле для отслеживания заполненности ролей в project_roles
ALTER TABLE project_roles ADD COLUMN IF NOT EXISTS filled_positions INTEGER DEFAULT 0;

-- Функция для автоматического обновления filled_positions
CREATE OR REPLACE FUNCTION update_filled_positions()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.status = 'accepted' THEN
        UPDATE project_roles 
        SET filled_positions = filled_positions + 1 
        WHERE id = NEW.role_id;
    ELSIF TG_OP = 'UPDATE' AND OLD.status != NEW.status THEN
        IF NEW.status = 'accepted' AND OLD.status != 'accepted' THEN
            UPDATE project_roles 
            SET filled_positions = filled_positions + 1 
            WHERE id = NEW.role_id;
        ELSIF OLD.status = 'accepted' AND NEW.status != 'accepted' THEN
            UPDATE project_roles 
            SET filled_positions = filled_positions - 1 
            WHERE id = NEW.role_id;
        END IF;
    ELSIF TG_OP = 'DELETE' AND OLD.status = 'accepted' THEN
        UPDATE project_roles 
        SET filled_positions = filled_positions - 1 
        WHERE id = OLD.role_id;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ language 'plpgsql';

-- Триггер для автоматического обновления filled_positions
CREATE TRIGGER update_filled_positions_trigger
    AFTER INSERT OR UPDATE OR DELETE ON executor_applications
    FOR EACH ROW EXECUTE FUNCTION update_filled_positions(); 