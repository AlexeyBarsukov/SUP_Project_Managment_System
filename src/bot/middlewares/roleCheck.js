const User = require('../../db/models/User');
const { roleSelectionKeyboard } = require('../keyboards');

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

module.exports = {
    roleCheck,
    customerOnly,
    managerOnly,
    executorOnly,
    customerOrManager
}; 