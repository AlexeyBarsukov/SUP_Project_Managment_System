const User = require('../../db/models/User');
const { roleSelectionKeyboard } = require('../keyboards');
const { Markup } = require('telegraf');

const roleCheck = (allowedRoles) => {
    return async (ctx, next) => {
        try {
            // Лог для отладки
            console.log('[roleCheck] Start for user:', ctx.from?.id);
            
            if (!ctx.user) {
                ctx.user = await User.findByTelegramId(ctx.from.id);
                if (!ctx.user) {
                    console.log('[roleCheck] User not found');
                    await ctx.reply('Сначала зарегистрируйтесь через /start');
                    return; // Завершаем цепочку
                }
            }

            console.log('[roleCheck] Current user:', ctx.user);
            console.log('[roleCheck] Role:', ctx.user?.main_role);

            if (!ctx.user?.main_role) {
                console.log('[roleCheck] No main role');
                await ctx.reply(
                    '❌ У вас не выбрана роль. Используйте /start для выбора роли.',
                    { reply_markup: roleSelectionKeyboard.reply_markup }
                );
                return; // Завершаем цепочку
            }

            if (allowedRoles && !allowedRoles.includes(ctx.user.main_role)) {
                const roleNames = {
                    'customer': 'Заказчик',
                    'manager': 'Менеджер',
                    'executor': 'Исполнитель'
                };
                console.log('[roleCheck] Role not allowed');
                await ctx.reply(
                    `❌ Эта команда доступна только для ролей: ${allowedRoles.map(r => roleNames[r]).join(', ')}\n` +
                    `Ваша роль: ${roleNames[ctx.user.main_role]}`,
                    { parse_mode: 'HTML' }
                );
                return; // Завершаем цепочку
            }

            console.log('[roleCheck] Role check passed');
            return next(); // Все проверки пройдены, продолжаем

        } catch (error) {
            console.error('[roleCheck] Error:', error);
            await ctx.reply('❌ Произошла ошибка при проверке роли');
            return; // Завершаем цепочку
        }
    };
};

// Middleware для проверки конкретных ролей
const customerOnly = roleCheck(['customer']);
const managerOnly = roleCheck(['manager']);
const executorOnly = roleCheck(['executor']);
const customerOrManager = roleCheck(['customer', 'manager']);

// Middleware: Исполнитель должен заполнить профиль для доступа к функционалу
const executorProfileRequired = () => {
    return async (ctx, next) => {
        if (ctx.user && ctx.user.main_role === 'executor') {
            // Разрешаем только команду /profile, /fill_profile и кнопки, связанные с профилем
            const allowedCommands = ['/profile', '/fill_profile', '⚙️ Профиль', 'Заполнить профиль', '✏️ Редактировать профиль'];
            const projectCommands = [
                'мои проекты', 'доступные проекты', 'отклики', 'найти проекты', 'моя активность',
                '/tasks', '/projects', '/responses'
            ];
            const text = (ctx.message?.text || ctx.update?.message?.text || ctx.callbackQuery?.data || '').toLowerCase();

            // --- Исправление: всегда разрешаем /fill_profile и callback 'fill_profile' ---
            // 1. Если это команда /fill_profile
            if (ctx.message && ctx.message.text && ctx.message.text.trim().toLowerCase().startsWith('/fill_profile')) {
                return next();
            }
            // 2. Если это callback 'fill_profile'
            if (ctx.callbackQuery && ctx.callbackQuery.data === 'fill_profile') {
                return next();
            }
            // 3. Разрешаем все callback-коды, используемые для шагов заполнения профиля исполнителя
            const allowedProfileStepCallbacks = [
                /^spec_/, /^exp_/, /^skill_/, 'skills_done', 'skills_clear', 'profile_back',
                'fill_achievements', 'skip_optional', 'fill_salary', 'fill_contacts', /^salary_/, 'fill_profile_yes', 'fill_profile_no'
            ];
            if (ctx.callbackQuery && ctx.callbackQuery.data) {
                for (const pattern of allowedProfileStepCallbacks) {
                    if (typeof pattern === 'string' && ctx.callbackQuery.data === pattern) return next();
                    if (pattern instanceof RegExp && pattern.test(ctx.callbackQuery.data)) return next();
                }
            }
            // 4. Разрешаем любые текстовые сообщения, если пользователь в процессе заполнения профиля исполнителя
            if (ctx.session && ctx.session.executorProfile && ctx.session.executorProfile.step) {
                if (ctx.message && ctx.message.text) {
                    return next();
                }
            }
            // ------------------------------------------------------

            // Проверяем заполненность профиля
            const isComplete = await User.isExecutorProfileFullyComplete(ctx.user.telegram_id);

            // Если профиль заполнен, разрешаем все команды
            if (isComplete) {
                return next();
            }

            // Если профиль не заполнен, блокируем доступ к проектам
            if (projectCommands.some(cmd => text.includes(cmd))) {
                await ctx.reply(
                    '🔒 Доступ закрыт! Сначала заполните профиль.\nНажмите /fill_profile или кнопку ниже.',
                    Markup.inlineKeyboard([
                        [Markup.button.callback('Заполнить профиль', 'fill_profile')]
                    ])
                );
                return;
            }

            // Разрешаем только команды профиля
            if (!allowedCommands.some(cmd => text && text.includes(cmd))) {
                await ctx.reply(
                    '🔒 Доступ закрыт! Сначала заполните профиль.\nНажмите /fill_profile или кнопку ниже.',
                    Markup.inlineKeyboard([
                        [Markup.button.callback('Заполнить профиль', 'fill_profile')]
                    ])
                );
                return;
            }
        }
        return next();
    };
};

module.exports = {
    roleCheck,
    customerOnly,
    managerOnly,
    executorOnly,
    customerOrManager,
    executorProfileRequired
}; 