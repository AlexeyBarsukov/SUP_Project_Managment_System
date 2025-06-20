# Telegram Bot для управления проектами

Telegram-бот для управления проектами с ролевой системой: Заказчик, Менеджер, Исполнитель.

## 🚀 Возможности

- **Ролевая система**: Заказчик, Менеджер, Исполнитель
- **Управление проектами**: Создание, редактирование, изменение статуса
- **Участники проектов**: Добавление/удаление участников, управление ролями
- **Аудит**: Логирование всех действий в проектах
- **Rate Limiting**: Ограничение частоты запросов
- **Уведомления**: Автоматические уведомления о событиях

## 🛠 Технологии

- **Node.js** - серверная платформа
- **Telegraf.js** - фреймворк для Telegram ботов
- **PostgreSQL** - основная база данных
- **Redis** - кэширование и rate limiting
- **Docker** - контейнеризация

## 📋 Требования

- Node.js 18+
- PostgreSQL 15+
- Redis 7+
- Docker и Docker Compose (опционально)

## 🚀 Быстрый старт

### 1. Клонирование репозитория

```bash
git clone <repository-url>
cd project-management-bot
```

### 2. Установка зависимостей

```bash
npm install
```

### 3. Настройка переменных окружения

Создайте файл `.env` на основе `env.example`:

```bash
cp env.example .env
```

Отредактируйте `.env` файл:

```env
TELEGRAM_TOKEN=8156003694:AAHhkSMcmdQzn_R_xHhoZrVFchUHqToMsNc
DB_URL=postgres://postgres:password@localhost:5432/project_management
REDIS_URL=redis://localhost:6379
ADMIN_ID=123456789
NODE_ENV=development
```

### 4. Запуск с Docker (рекомендуется)

```bash
# Запуск PostgreSQL и Redis
docker-compose -p project up -d postgres redis

# Ожидание готовности баз данных
sleep 10

# Запуск бота
npm start
```

### 5. Запуск без Docker

#### Установка PostgreSQL

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install postgresql postgresql-contrib

# macOS
brew install postgresql
brew services start postgresql

# Создание базы данных
sudo -u postgres createdb project_management
```

#### Установка Redis

```bash
# Ubuntu/Debian
sudo apt install redis-server

# macOS
brew install redis
brew services start redis
```

#### Инициализация базы данных

```bash
# Подключение к PostgreSQL
psql -U postgres -d project_management -f db/init.sql
```

#### Запуск бота

```bash
npm start
```

## 📁 Структура проекта

```
project/
├── src/
│   ├── bot/                  # Логика бота
│   │   ├── commands/         # Обработчики команд
│   │   │   ├── start.js      # /start
│   │   │   └── projects.js   # Управление проектами
│   │   ├── middlewares/      # Проверки и ограничения
│   │   │   ├── rateLimit.js  # Лимиты запросов
│   │   │   └── roleCheck.js  # Проверка ролей
│   │   └── keyboards.js      # Генерация кнопок
│   ├── db/                   # Работа с БД
│   │   ├── models/           # Модели данных
│   │   │   ├── User.js       # Пользователи
│   │   │   ├── Project.js    # Проекты
│   │   │   └── AuditLog.js   # Лог действий
│   │   ├── connection.js     # Подключение к БД
│   │   └── init.sql          # Инициализация БД
│   ├── utils/                # Вспомогательные функции
│   │   ├── validation.js     # Валидация данных
│   │   └── notifications.js  # Уведомления
│   └── app.js                # Главный файл бота
├── .env                      # Переменные окружения
├── package.json              # Зависимости
├── docker-compose.yml        # Конфигурация Docker
├── Dockerfile                # Docker образ
└── README.md                 # Документация
```

## 🎯 Команды бота

### Основные команды

- `/start` - Регистрация и выбор роли
- `/project [ID]` - Просмотр проекта
- `/join [ID]` - Запрос на присоединение к проекту

### Кнопки меню

#### Заказчик
- 📋 Мои проекты
- ➕ Создать проект
- 📊 Аудит лог
- ⚙️ Профиль
- 🔍 Найти менеджеров
- 🔍 Найти исполнителей

#### Менеджер
- 📋 Мои проекты
- 🔍 Найти исполнителей
- 📊 Статистика
- ⚙️ Профиль
- 🔍 Доступные проекты

#### Исполнитель
- 📋 Мои проекты
- 🔍 Доступные проекты
- 📊 Моя активность
- ⚙️ Профиль
- 🔍 Найти проекты

## 🔧 Разработка

### Запуск в режиме разработки

```bash
npm run dev
```

### Тестирование

```bash
npm test
```

### Логирование

Бот автоматически логирует:
- Все действия пользователей
- Ошибки и исключения
- Аудит изменений в проектах

## 📊 База данных

### Основные таблицы

- **users** - Пользователи системы
- **projects** - Проекты
- **project_members** - Участники проектов
- **audit_log** - Лог действий

### Схема базы данных

```sql
-- Пользователи
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    telegram_id INTEGER UNIQUE NOT NULL,
    username VARCHAR(100),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    role VARCHAR(20) CHECK (role IN ('customer', 'manager', 'executor')),
    is_visible BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Проекты
CREATE TABLE projects (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'draft',
    customer_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Участники проектов
CREATE TABLE project_members (
    project_id INTEGER REFERENCES projects(id),
    user_id INTEGER REFERENCES users(id),
    role VARCHAR(20) CHECK (role IN ('manager', 'executor')),
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (project_id, user_id)
);

-- Аудит
CREATE TABLE audit_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    action VARCHAR(50) NOT NULL,
    project_id INTEGER REFERENCES projects(id),
    details JSONB,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 🔒 Безопасность

- Rate limiting для предотвращения спама
- Валидация всех входных данных
- Проверка ролей для каждой команды
- Логирование всех действий
- Защита от SQL-инъекций

## 📈 Мониторинг

### Метрики

- Количество активных пользователей
- Количество созданных проектов
- Частота использования команд
- Ошибки и исключения

### Уведомления

Бот отправляет уведомления:
- О создании проектов
- О запросах на присоединение
- Об изменениях в проектах
- Об ошибках (администратору)

## 🚀 Деплой

### Heroku

```bash
# Создание приложения
heroku create your-bot-name

# Добавление PostgreSQL
heroku addons:create heroku-postgresql:hobby-dev

# Добавление Redis
heroku addons:create heroku-redis:hobby-dev

# Настройка переменных окружения
heroku config:set TELEGRAM_TOKEN=your_token
heroku config:set ADMIN_ID=your_admin_id

# Деплой
git push heroku main
```

### AWS

```bash
# Создание ECS кластера
aws ecs create-cluster --cluster-name bot-cluster

# Создание задачи
aws ecs register-task-definition --cli-input-json file://task-definition.json

# Запуск сервиса
aws ecs create-service --cluster bot-cluster --service-name bot-service --task-definition bot-task
```

## 🤝 Вклад в проект

1. Fork репозитория
2. Создайте ветку для новой функции
3. Внесите изменения
4. Добавьте тесты
5. Создайте Pull Request

## 📄 Лицензия

MIT License

## 📞 Поддержка

При возникновении проблем:
1. Проверьте логи бота
2. Убедитесь в правильности настроек
3. Создайте Issue в репозитории

## 🔄 Обновления

Для обновления бота:

```bash
git pull origin main
npm install
npm start
```

---

**Версия**: 1.0.0  
**Автор**: Project Management Bot Team  
**Дата**: 21 июня 2025