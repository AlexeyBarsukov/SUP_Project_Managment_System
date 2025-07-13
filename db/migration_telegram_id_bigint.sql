ALTER TABLE users
    ALTER COLUMN telegram_id TYPE BIGINT USING telegram_id::bigint; 