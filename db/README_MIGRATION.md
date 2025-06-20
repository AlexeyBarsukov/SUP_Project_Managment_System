# Миграция базы данных: ON DELETE CASCADE

## Описание
Эта миграция добавляет `ON DELETE CASCADE` к внешним ключам для автоматического удаления связанных данных при удалении проекта.

## Затронутые таблицы
- `audit_log` - логи аудита
- `user_project_roles` - роли пользователей в проектах

## Применение миграции

### Вариант 1: Через psql
```bash
psql -h localhost -U your_username -d your_database -f migration_cascade_delete.sql
```

### Вариант 2: Через Docker
```bash
docker exec -i your_postgres_container psql -U your_username -d your_database < migration_cascade_delete.sql
```

### Вариант 3: Через pgAdmin или другой GUI
Скопируйте содержимое файла `migration_cascade_delete.sql` и выполните в вашем SQL-клиенте.

## Что делает миграция

1. **Удаляет существующие внешние ключи** без CASCADE
2. **Создает новые внешние ключи** с `ON DELETE CASCADE`
3. **Проверяет результат** миграции

## После миграции

После применения миграции можно упростить код удаления проекта, так как база данных будет автоматически удалять связанные записи.

## Проверка миграции

Выполните запрос для проверки:
```sql
SELECT 
    tc.table_name, 
    tc.constraint_name, 
    rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.referential_constraints rc 
    ON tc.constraint_name = rc.constraint_name
WHERE tc.table_name IN ('audit_log', 'user_project_roles')
    AND tc.constraint_type = 'FOREIGN KEY';
```

Все `delete_rule` должны быть `CASCADE`.

## Откат миграции

Если нужно откатить изменения:
```sql
-- Удаляем CASCADE ограничения
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_project_id_fkey;
ALTER TABLE user_project_roles DROP CONSTRAINT IF EXISTS user_project_roles_project_id_fkey;
ALTER TABLE user_project_roles DROP CONSTRAINT IF EXISTS user_project_roles_user_id_fkey;

-- Восстанавливаем SET NULL для audit_log
ALTER TABLE audit_log 
ADD CONSTRAINT audit_log_project_id_fkey 
FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;

-- Восстанавливаем обычные ограничения для user_project_roles
ALTER TABLE user_project_roles 
ADD CONSTRAINT user_project_roles_project_id_fkey 
FOREIGN KEY (project_id) REFERENCES projects(id);

ALTER TABLE user_project_roles 
ADD CONSTRAINT user_project_roles_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES users(id);
``` 