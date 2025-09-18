#!/bin/bash

# Скрипт для развертывания проекта
echo "🚀 Начинаем развертывание проекта управления проектами..."

# Проверяем наличие необходимых переменных окружения
if [ -z "$TELEGRAM_TOKEN" ]; then
    echo "❌ Ошибка: TELEGRAM_TOKEN не установлен"
    exit 1
fi

if [ -z "$DB_URL" ]; then
    echo "❌ Ошибка: DB_URL не установлен"
    exit 1
fi

echo "✅ Переменные окружения проверены"

# Устанавливаем зависимости
echo "📦 Устанавливаем зависимости..."
npm ci --only=production

# Проверяем подключение к базе данных
echo "🔍 Проверяем подключение к базе данных..."
node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DB_URL });
pool.query('SELECT 1')
  .then(() => {
    console.log('✅ Подключение к базе данных успешно');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Ошибка подключения к базе данных:', err.message);
    process.exit(1);
  });
"

# Запускаем миграции базы данных
echo "🗄️ Выполняем миграции базы данных..."
node -e "
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DB_URL });

async function runMigrations() {
  try {
    const migrationDir = path.join(__dirname, 'db');
    const files = fs.readdirSync(migrationDir)
      .filter(file => file.endsWith('.sql'))
      .sort();
    
    for (const file of files) {
      console.log(\`📝 Выполняем миграцию: \${file}\`);
      const sql = fs.readFileSync(path.join(migrationDir, file), 'utf8');
      await pool.query(sql);
    }
    
    console.log('✅ Все миграции выполнены успешно');
    await pool.end();
  } catch (error) {
    console.error('❌ Ошибка при выполнении миграций:', error.message);
    process.exit(1);
  }
}

runMigrations();
"

echo "🎉 Развертывание завершено успешно!"
echo "🤖 Запускаем бота..."
npm start
