const User = require('../db/models/User');
const Project = require('../db/models/Project');

// Отправка уведомления пользователю
const sendNotification = async (ctx, telegramId, message, options = {}) => {
    try {
        await ctx.telegram.sendMessage(telegramId, message, {
            parse_mode: 'HTML',
            ...options
        });
        return true;
    } catch (error) {
        console.error(`Error sending notification to ${telegramId}:`, error);
        return false;
    }
};

// Уведомление о создании проекта
const notifyProjectCreated = async (ctx, project, customer) => {
    if (!project) {
        console.error('notifyProjectCreated: project is undefined!');
        return;
    }
    const message = `
🎉 <b>Проект создан!</b>

📋 <b>Название:</b> ${project.name}
📝 <b>Описание:</b> ${project.description}
👤 <b>Заказчик:</b> ${customer.first_name} ${customer.last_name || ''}
🆔 <b>ID проекта:</b> ${project.id}
📅 <b>Создан:</b> ${new Date(project.created_at).toLocaleString('ru-RU')}

Проект находится в статусе "Черновик". Вы можете изменить его статус на "Активный" для привлечения участников.
    `;
    
    return sendNotification(ctx, customer.telegram_id, message);
};

// Уведомление о запросе на присоединение к проекту
const notifyJoinRequest = async (ctx, project, requester, managers) => {
    if (!project) {
        console.error('notifyJoinRequest: project is undefined!');
        return;
    }
    const requesterMessage = `
📤 <b>Запрос отправлен!</b>

Вы отправили запрос на присоединение к проекту:
📋 <b>Проект:</b> ${project.name}
🆔 <b>ID:</b> ${project.id}

Ожидайте ответа от менеджера проекта.
    `;
    
    await sendNotification(ctx, requester.telegram_id, requesterMessage);
    
    // Уведомляем всех менеджеров проекта
    const managerMessage = `
🔔 <b>Новый запрос на присоединение!</b>

👤 <b>Пользователь:</b> ${requester.first_name} ${requester.last_name || ''}
📋 <b>Проект:</b> ${project.name}
🆔 <b>ID проекта:</b> ${project.id}

Используйте команду /project_${project.id} для управления участниками.
    `;
    
    for (const manager of managers) {
        await sendNotification(ctx, manager.telegram_id, managerMessage);
    }
};

// Уведомление о добавлении в проект
const notifyAddedToProject = async (ctx, project, user, role) => {
    if (!project) {
        console.error('notifyAddedToProject: project is undefined!');
        return;
    }
    const roleNames = {
        'manager': 'менеджером',
        'executor': 'исполнителем'
    };
    
    const message = `
✅ <b>Вас добавили в проект!</b>

📋 <b>Проект:</b> ${project.name}
👤 <b>Роль:</b> ${roleNames[role]}
🆔 <b>ID проекта:</b> ${project.id}

Используйте команду /project_${project.id} для просмотра деталей проекта.
    `;
    
    return sendNotification(ctx, user.telegram_id, message);
};

// Уведомление об удалении из проекта
const notifyRemovedFromProject = async (ctx, project, user) => {
    if (!project) {
        console.error('notifyRemovedFromProject: project is undefined!');
        return;
    }
    const message = `
❌ <b>Вас удалили из проекта</b>

📋 <b>Проект:</b> ${project.name}
🆔 <b>ID проекта:</b> ${project.id}

Если у вас есть вопросы, свяжитесь с заказчиком проекта.
    `;
    
    return sendNotification(ctx, user.telegram_id, message);
};

// Уведомление об изменении статуса проекта
const notifyProjectStatusChanged = async (ctx, project, oldStatus, newStatus, members) => {
    if (!project) {
        console.error('notifyProjectStatusChanged: project is undefined!');
        return;
    }
    const statusNames = {
        'draft': 'Черновик',
        'active': 'Активный',
        'searching_manager': 'Поиск менеджера',
        'searching_executors': 'Поиск исполнителей',
        'in_progress': 'В работе',
        'archived': 'Архив'
    };
    
    const message = `
🔄 <b>Статус проекта изменен</b>

📋 <b>Проект:</b> ${project.name}
🆔 <b>ID проекта:</b> ${project.id}
📊 <b>Статус:</b> ${statusNames[oldStatus]} → ${statusNames[newStatus]}

Используйте команду /project_${project.id} для просмотра деталей проекта.
    `;
    
    // Уведомляем всех участников проекта
    for (const member of members) {
        await sendNotification(ctx, member.telegram_id, message);
    }
};

// Уведомление администратора об ошибке
const notifyAdminError = async (ctx, error, context = '') => {
    const adminId = process.env.ADMIN_ID;
    if (!adminId) return;
    
    const message = `
🚨 <b>Ошибка в боте</b>

${context ? `📋 <b>Контекст:</b> ${context}\n` : ''}
❌ <b>Ошибка:</b> ${error.message}
📅 <b>Время:</b> ${new Date().toLocaleString('ru-RU')}
    `;
    
    return sendNotification(ctx, adminId, message);
};

// Уведомление о новой активности в проекте
const notifyProjectActivity = async (ctx, project, activity, user) => {
    if (!project) {
        console.error('notifyProjectActivity: project is undefined!');
        return;
    }
    const message = `
🔔 <b>Новая активность в проекте</b>

📋 <b>Проект:</b> ${project.name}
👤 <b>Пользователь:</b> ${user.first_name} ${user.last_name || ''}
📝 <b>Действие:</b> ${activity}
🆔 <b>ID проекта:</b> ${project.id}
    `;
    
    // Получаем всех участников проекта
    const members = await Project.getMembers(project.id);
    
    // Уведомляем всех участников, кроме того, кто выполнил действие
    for (const member of members) {
        if (member.telegram_id !== user.telegram_id) {
            await sendNotification(ctx, member.telegram_id, message);
        }
    }
};

module.exports = {
    sendNotification: (ctx, ...args) => sendNotification(ctx, ...args),
    notifyProjectCreated,
    notifyJoinRequest,
    notifyAddedToProject,
    notifyRemovedFromProject,
    notifyProjectStatusChanged,
    notifyAdminError,
    notifyProjectActivity
}; 