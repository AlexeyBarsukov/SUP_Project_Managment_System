# 🚀 Руководство по развертыванию проекта

## Подготовка к развертыванию

### 1. Получение Telegram Bot Token

1. Напишите [@BotFather](https://t.me/BotFather) в Telegram
2. Создайте нового бота командой `/newbot`
3. Следуйте инструкциям и получите токен
4. Сохраните токен для настройки переменных окружения

### 2. Настройка базы данных

Выберите один из вариантов:

#### Вариант A: PostgreSQL в облаке
- **Heroku Postgres** (бесплатно до 10,000 строк)
- **ElephantSQL** (бесплатно до 20MB)
- **Supabase** (бесплатно до 500MB)

#### Вариант B: Redis в облаке (опционально)
- **Redis Cloud** (бесплатно до 30MB)
- **Heroku Redis** (платно)
- **Примечание**: Redis используется для rate limiting и кэширования. Бот будет работать и без Redis, но с ограниченной функциональностью.

## Платформы для развертывания

### 🌟 Рекомендуемые платформы

#### 1. Heroku (Рекомендуется)
```bash
# Установите Heroku CLI
# https://devcenter.heroku.com/articles/heroku-cli

# Логин в Heroku
heroku login

# Создайте приложение
heroku create your-project-management-bot

# Добавьте PostgreSQL
heroku addons:create heroku-postgresql:mini

# Добавьте Redis (опционально, для rate limiting)
heroku addons:create heroku-redis:mini

# Установите переменные окружения
heroku config:set TELEGRAM_TOKEN=your_bot_token_here
heroku config:set ADMIN_ID=your_telegram_id_here

# Разверните приложение
git push heroku main
```

#### 2. Railway
```bash
# Установите Railway CLI
npm install -g @railway/cli

# Логин
railway login

# Создайте проект
railway init

# Добавьте переменные окружения в Railway Dashboard
# TELEGRAM_TOKEN, ADMIN_ID, DB_URL, REDIS_URL

# Разверните
railway up
```

#### 3. Render (Рекомендуется для простоты)
```bash
# 1. Подключите GitHub репозиторий к Render
# 2. Render автоматически обнаружит render.yaml
# 3. Render автоматически создаст PostgreSQL базу данных
# 4. Настройте переменные окружения в Dashboard:
#    - TELEGRAM_TOKEN=your_bot_token_here
#    - ADMIN_ID=your_telegram_id_here
#    - DB_URL=postgres://user:password@host:port/database (из базы данных)
# 5. Развертывание происходит автоматически

# Важно: DB_URL нужно скопировать из раздела "Database" в Render Dashboard

## Подробная настройка Render:

### Шаг 1: Создание проекта
1. Зайдите на [render.com](https://render.com)
2. Нажмите "New +" → "Web Service"
3. Подключите ваш GitHub репозиторий
4. Render автоматически обнаружит `render.yaml`

### Шаг 2: Настройка базы данных
1. В Render Dashboard нажмите "New +" → "PostgreSQL"
2. Выберите план "Free"
3. Назовите базу данных `project-management-db`
4. Дождитесь создания базы данных

### Шаг 3: Настройка переменных окружения
В разделе "Environment" вашего веб-сервиса добавьте:

```
TELEGRAM_TOKEN = your_telegram_bot_token_here
ADMIN_ID = your_telegram_id_here
DB_URL = postgres://user:password@host:port/database_name
```

**Где взять DB_URL:**
1. Перейдите в раздел "Database" 
2. Найдите вашу базу данных `project-management-db`
3. Скопируйте "External Database URL"
4. Вставьте его как значение переменной `DB_URL`

### Шаг 4: Развертывание
1. Нажмите "Manual Deploy" или сделайте commit в Git
2. Дождитесь завершения развертывания
3. Проверьте логи на наличие ошибок
```

#### 4. DigitalOcean App Platform
1. Создайте аккаунт на DigitalOcean
2. Перейдите в App Platform
3. Подключите GitHub репозиторий
4. Настройте переменные окружения
5. Добавьте PostgreSQL и Redis базы данных

### 4. VPS развертывание (Docker)

```bash
# На VPS сервере
git clone your-repository-url
cd your-project-directory

# Создайте .env файл
cp env.production.example .env
# Отредактируйте .env с реальными значениями

# Запустите с Docker Compose
docker-compose up -d
```

## Переменные окружения

Создайте файл `.env` на основе `env.production.example`:

```env
TELEGRAM_TOKEN=your_telegram_bot_token_here
DB_URL=postgres://username:password@host:port/database_name
REDIS_URL=redis://host:port
ADMIN_ID=your_admin_telegram_id
NODE_ENV=production
PORT=3000
```

## Проверка развертывания

### 1. Проверка логов
```bash
# Heroku
heroku logs --tail

# Railway
railway logs

# Render
# Логи доступны в Dashboard

# Docker
docker-compose logs -f bot
```

### 4. Health Check
После развертывания проверьте, что сервис работает:
```bash
# Основной endpoint
curl https://your-app-name.onrender.com/

# Health check
curl https://your-app-name.onrender.com/health
```

### 2. Проверка базы данных
```bash
# Подключение к PostgreSQL
psql $DB_URL

# Проверка таблиц
\dt
```

### 3. Тестирование бота
1. Найдите вашего бота в Telegram
2. Отправьте команду `/start`
3. Проверьте функциональность

## Мониторинг и обслуживание

### Автоматические перезапуски
- Heroku: автоматически перезапускает при сбоях
- Railway: автоматически перезапускает при сбоях
- Docker: используйте `restart: unless-stopped`

### Логирование
- Настройте централизованное логирование (например, LogDNA, Papertrail)
- Мониторьте ошибки и производительность

### Резервное копирование
- Настройте автоматические бэкапы базы данных
- Регулярно экспортируйте данные

## Устранение неполадок

### Частые проблемы

1. **Бот не отвечает**
   - Проверьте TELEGRAM_TOKEN
   - Проверьте логи на ошибки
   - Убедитесь, что бот запущен

2. **Ошибки базы данных**
   - Проверьте DB_URL
   - Убедитесь, что миграции выполнены
   - Проверьте подключение к базе

3. **Проблемы с Redis**
   - Проверьте REDIS_URL
   - Redis не критичен для работы бота

### Команды для диагностики

```bash
# Проверка статуса приложения
heroku ps

# Проверка переменных окружения
heroku config

# Перезапуск приложения
heroku restart
```

## Безопасность

1. **Никогда не коммитьте .env файлы**
2. **Используйте сильные пароли для баз данных**
3. **Регулярно обновляйте зависимости**
4. **Мониторьте логи на подозрительную активность**

## Масштабирование

При росте нагрузки:
1. Обновите план базы данных
2. Добавьте Redis для кэширования
3. Рассмотрите горизонтальное масштабирование
4. Оптимизируйте запросы к базе данных
