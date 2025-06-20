#!/bin/bash

echo "🚀 Запуск бота в режиме разработки..."
echo "📝 nodemon будет автоматически перезапускать бота при изменении файлов"
echo "🛑 Для остановки нажмите Ctrl+C"
echo ""

# Проверяем, установлен ли nodemon
if ! command -v nodemon &> /dev/null; then
    echo "❌ nodemon не установлен. Устанавливаем..."
    npm install -g nodemon
fi

# Запускаем в режиме разработки
npm run dev 