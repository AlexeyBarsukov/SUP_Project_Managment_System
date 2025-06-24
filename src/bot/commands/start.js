const User = require('../../db/models/User');
const { roleSelectionKeyboard, getKeyboardByRole } = require('../keyboards');
const { validateRole } = require('../../utils/validation');

const startCommand = async (ctx) => {
    try {
        const telegramId = ctx.from.id;
        const username = ctx.from.username;
        const firstName = ctx.from.first_name;
        const lastName = ctx.from.last_name;

        // Проверяем, существует ли пользователь
        let user = await User.findByTelegramId(telegramId);

        if (!user) {
            // Создаем нового пользователя без основной роли
            user = await User.create(telegramId, username, firstName, lastName, null);
            
            await ctx.reply(
                '🚀 <b>Добро пожаловать в систему управления проектами!</b>\n\n' +
                'Выберите роль, которая лучше всего описывает ваши цели:\n\n' +
                '👤 <b>Заказчик</b>\n' +
                '• У вас есть идея проекта и нужна команда\n' +
                '• Ищете специалистов для реализации задач\n' +
                '• Хотите контролировать процесс разработки\n\n' +
                '👨‍💼 <b>Менеджер</b>\n' +
                '• Имеете опыт управления командами\n' +
                '• Умеете координировать работу исполнителей\n' +
                '• Готовы брать ответственность за проекты\n\n' +
                '👷 <b>Исполнитель</b>\n' +
                '• Программирование, дизайн, аналитика\n' +
                '• Готовы выполнять задачи в команде\n' +
                '• Ищете интересные проекты для участия',
                {
                    parse_mode: 'HTML',
                    reply_markup: roleSelectionKeyboard.reply_markup
                }
            );
        } else if (!user.main_role) {
            // Пользователь существует, но основная роль не выбрана
            await ctx.reply(
                '👋 <b>С возвращением!</b>\n\n' +
                'Для продолжения работы выберите вашу роль:\n\n' +
                '👤 <b>Заказчик</b>\n' +
                '• У вас есть идея проекта и нужна команда\n' +
                '• Ищете специалистов для реализации задач\n' +
                '• Хотите контролировать процесс разработки\n\n' +
                '👨‍💼 <b>Менеджер</b>\n' +
                '• Имеете опыт управления командами\n' +
                '• Умеете координировать работу исполнителей\n' +
                '• Готовы брать ответственность за проекты\n\n' +
                '👷 <b>Исполнитель</b>\n' +
                '• Программирование, дизайн, аналитика\n' +
                '• Готовы выполнять задачи в команде\n' +
                '• Ищете интересные проекты для участия',
                {
                    parse_mode: 'HTML',
                    reply_markup: roleSelectionKeyboard.reply_markup
                }
            );
        } else {
            // Пользователь уже имеет основную роль
            const roleNames = {
                'customer': 'Заказчик',
                'manager': 'Менеджер',
                'executor': 'Исполнитель'
            };

            await ctx.reply(
                `👋 <b>С возвращением, ${firstName}!</b>\n\n` +
                `Ваша роль: <b>${roleNames[user.main_role]}</b>\n\n` +
                'Выберите действие:',
                {
                    parse_mode: 'HTML',
                    reply_markup: getKeyboardByRole(user.main_role).reply_markup
                }
            );
        }
    } catch (error) {
        console.error('Error in start command:', error);
        await ctx.reply('❌ Произошла ошибка при запуске бота. Попробуйте позже.');
    }
};

// Обработчик выбора роли
const handleRoleSelection = async (ctx) => {
    try {
        const roleMap = {
            '👤 Заказчик': 'customer',
            '👨‍💼 Менеджер': 'manager',
            '👷 Исполнитель': 'executor'
        };

        const selectedRole = roleMap[ctx.message.text];
        
        if (!selectedRole) {
            return ctx.reply('❌ Неверный выбор роли. Попробуйте еще раз.');
        }

        // Валидируем роль
        const validation = validateRole(selectedRole);
        if (!validation.isValid) {
            return ctx.reply(`❌ ${validation.error}`);
        }

        // Обновляем основную роль пользователя
        const user = await User.updateMainRole(ctx.from.id, selectedRole);
        
        if (!user) {
            return ctx.reply('❌ Пользователь не найден. Используйте /start для регистрации.');
        }

        // Логируем изменение роли (если это не первое назначение роли)
        if (user.main_role !== selectedRole) {
            const AuditLog = require('../../db/models/AuditLog');
            await AuditLog.create(
                ctx.from.id,
                'ROLE_CHANGE',
                null,
                { 
                    oldRole: user.main_role || 'unknown', 
                    newRole: selectedRole,
                    username: user.username 
                }
            );
        }

        // Обновляем ctx.user для корректной работы профиля
        ctx.user = await User.findByTelegramId(ctx.from.id);

        const roleNames = {
            'customer': 'Заказчик',
            'manager': 'Менеджер',
            'executor': 'Исполнитель'
        };

        await ctx.reply(
            `✅ <b>Роль успешно установлена!</b>\n\n` +
            `Ваша роль: <b>${roleNames[selectedRole]}</b>\n\n` +
            `Теперь вы можете использовать все функции, доступные для вашей роли.`,
            {
                parse_mode: 'HTML',
                reply_markup: getKeyboardByRole(selectedRole).reply_markup
            }
        );

    } catch (error) {
        console.error('Error in role selection:', error);
        await ctx.reply('❌ Произошла ошибка при выборе роли. Попробуйте позже.');
    }
};

module.exports = {
    startCommand,
    handleRoleSelection
}; 