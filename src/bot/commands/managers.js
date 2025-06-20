const { Markup } = require('telegraf');
const User = require('../../db/models/User');

async function handleManagersCommand(ctx) {
    const user = await User.findByTelegramId(ctx.from.id);
    
    if (!user) {
        return ctx.reply('Пользователь не найден. Пожалуйста, начните с /start');
    }
    
    if (user.main_role !== 'customer') {
        return ctx.reply('Эта команда доступна только заказчикам.');
    }
    
    try {
        const managers = await User.findManagersWithProfiles();
        
        if (managers.length === 0) {
            return ctx.reply('Пока нет доступных менеджеров.');
        }
        
        await ctx.reply(
            `Найдено ${managers.length} менеджеров:\n\n` +
            'Выберите менеджера для просмотра профиля:',
            createManagersKeyboard(managers)
        );
    } catch (error) {
        console.error('Error fetching managers:', error);
        await ctx.reply('❌ Ошибка при получении списка менеджеров.');
    }
}

function createManagersKeyboard(managers) {
    const buttons = managers.map(manager => [
        Markup.button.callback(
            `${manager.first_name} ${manager.last_name || ''}`.trim(),
            `manager_${manager.telegram_id}`
        )
    ]);
    
    return Markup.inlineKeyboard(buttons);
}

async function handleManagerProfile(ctx) {
    const data = ctx.callbackQuery.data;
    const managerTelegramId = data.replace('manager_', '');
    
    try {
        const manager = await User.findByTelegramId(managerTelegramId);
        const profile = await User.getManagerProfile(managerTelegramId);
        
        if (!manager || !profile) {
            await ctx.reply('Профиль менеджера не найден.');
            await ctx.answerCbQuery();
            return;
        }
        
        const profileText = formatManagerProfile(manager, profile);
        
        await ctx.reply(
            profileText,
            Markup.inlineKeyboard([
                [Markup.button.callback('Назад к списку', 'back_to_managers')]
            ])
        );
        await ctx.answerCbQuery();
    } catch (error) {
        console.error('Error fetching manager profile:', error);
        await ctx.reply('❌ Ошибка при получении профиля менеджера.');
        await ctx.answerCbQuery();
    }
}

function formatManagerProfile(manager, profile) {
    let text = `👤 *${manager.first_name} ${manager.last_name || ''}*\n`;
    
    if (manager.username) {
        text += `@${manager.username}\n`;
    }
    
    text += '\n📋 *Профиль:*\n';
    
    if (profile.specialization) {
        text += `🎯 *Специализация:* ${profile.specialization}\n`;
    }
    
    if (profile.experience) {
        text += `⏱ *Опыт:* ${profile.experience}\n`;
    }
    
    if (profile.skills) {
        let skillsText;
        if (Array.isArray(profile.skills)) {
            skillsText = profile.skills.join(', ');
        } else if (typeof profile.skills === 'string') {
            // Если навыки хранятся как строка, пытаемся их распарсить
            try {
                const skillsArray = JSON.parse(profile.skills);
                skillsText = Array.isArray(skillsArray) ? skillsArray.join(', ') : profile.skills;
            } catch {
                skillsText = profile.skills;
            }
        } else {
            skillsText = String(profile.skills);
        }
        text += `🛠 *Навыки:* ${skillsText}\n`;
    }
    
    if (profile.achievements) {
        text += `🏆 *Достижения:* ${profile.achievements}\n`;
    }
    
    if (profile.salary_range) {
        text += `💰 *Зарплата:* ${profile.salary_range}\n`;
    }
    
    if (profile.contacts) {
        text += `📞 *Контакты:* ${profile.contacts}\n`;
    }
    
    return text;
}

async function handleBackToManagers(ctx) {
    await handleManagersCommand(ctx);
    await ctx.answerCbQuery();
}

module.exports = {
    handleManagersCommand,
    handleManagerProfile,
    handleBackToManagers
}; 