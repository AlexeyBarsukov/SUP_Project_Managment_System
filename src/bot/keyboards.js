const { Markup } = require('telegraf');

// Клавиатура для выбора роли
const roleSelectionKeyboard = Markup.keyboard([
    ['👤 Заказчик', '👨‍💼 Менеджер'],
    ['👷 Исполнитель']
]).resize().oneTime();

// Клавиатура для заказчика
const customerKeyboard = Markup.keyboard([
    ['📋 Мои проекты', '➕ Создать проект'],
    ['📊 Аудит лог', '⚙️ Профиль'],
    ['🔍 Найти менеджеров', '🔍 Найти исполнителей']
]).resize();

// Клавиатура для менеджера
const managerKeyboard = Markup.keyboard([
    ['📋 Мои проекты', '🔍 Найти исполнителей'],
    ['📝 Заполнить профиль', '⚙️ Профиль'],
    ['👤 Изменить роль', '📊 Статистика'],
    ['🔍 Доступные проекты']
]).resize();

// Клавиатура для исполнителя
const executorKeyboard = Markup.keyboard([
    ['📋 Мои проекты', '🔍 Доступные проекты'],
    ['📊 Моя активность', '⚙️ Профиль'],
    ['🔍 Найти проекты']
]).resize();

// Клавиатура для управления проектом (заказчик)
const projectManagementKeyboard = Markup.keyboard([
    ['👥 Участники', '📝 Изменить статус'],
    ['📊 Аудит лог', '❌ Удалить проект'],
    ['🔙 Назад к проектам']
]).resize();

// Клавиатура для статусов проекта
const projectStatusKeyboard = Markup.keyboard([
    ['📝 Черновик', '🚀 Активный'],
    ['📦 Архив', '🔙 Назад']
]).resize();

// Клавиатура для подтверждения
const confirmationKeyboard = Markup.keyboard([
    ['✅ Да', '❌ Нет']
]).resize().oneTime();

// Динамическая клавиатура профиля по основной роли и ADMIN_ID
const profileKeyboard = (mainRole, telegramId, adminId) => {
    const buttons = [
        [mainRole === 'customer' ? '🔍 Найти менеджеров' : '🔍 Доступные проекты'],
        ['👤 Изменить роль'],
        ['📋 Мои проекты'],
        ['🔙 Назад']
    ];
    if (String(telegramId) === String(adminId)) {
        buttons.splice(1, 0, ['🧹 Сбросить лимит']); // Вставляем после первой строки
    }
    return Markup.keyboard(buttons).resize();
};

// Клавиатура для видимости профиля
const visibilityKeyboard = Markup.keyboard([
    ['👁️ Открытый профиль', '🔒 Закрытый профиль'],
    ['🔙 Назад']
]).resize();

// Inline клавиатура для действий с проектом
const projectActionsInline = (projectId) => {
    return Markup.inlineKeyboard([
        [
            Markup.button.callback('👥 Участники', `project_members_${projectId}`),
            Markup.button.callback('📊 Аудит', `project_audit_${projectId}`)
        ],
        [
            Markup.button.callback('📝 Изменить статус', `project_status_${projectId}`),
            Markup.button.callback('❌ Удалить', `project_delete_${projectId}`)
        ]
    ]);
};

// Inline клавиатура для присоединения к проекту
const joinProjectInline = (projectId) => {
    return Markup.inlineKeyboard([
        [
            Markup.button.callback('✅ Присоединиться', `join_project_${projectId}`),
            Markup.button.callback('❌ Отклонить', `reject_join_${projectId}`)
        ]
    ]);
};

// Inline клавиатура для управления участниками
const memberActionsInline = (projectId, userId) => {
    return Markup.inlineKeyboard([
        [
            Markup.button.callback('👨‍💼 Сделать менеджером', `make_manager_${projectId}_${userId}`),
            Markup.button.callback('👷 Сделать исполнителем', `make_executor_${projectId}_${userId}`)
        ],
        [
            Markup.button.callback('❌ Удалить из проекта', `remove_member_${projectId}_${userId}`)
        ]
    ]);
};

// Динамическая клавиатура для менеджера с учётом заполненности профиля
const getManagerMenuKeyboard = (hasProfile) => {
    return Markup.keyboard([
        ['📋 Мои проекты', '🔍 Найти исполнителей'],
        [hasProfile ? '✏️ Редактировать профиль' : '📝 Заполнить профиль', '⚙️ Профиль'],
        ['👤 Изменить роль', '📊 Статистика'],
        ['🔍 Доступные проекты']
    ]).resize();
};

// Функция для получения клавиатуры по роли
const getKeyboardByRole = (role) => {
    switch (role) {
        case 'customer':
            return customerKeyboard;
        case 'manager':
            return managerKeyboard;
        case 'executor':
            return executorKeyboard;
        default:
            return roleSelectionKeyboard;
    }
};

module.exports = {
    roleSelectionKeyboard,
    customerKeyboard,
    managerKeyboard,
    executorKeyboard,
    projectManagementKeyboard,
    projectStatusKeyboard,
    confirmationKeyboard,
    profileKeyboard,
    visibilityKeyboard,
    projectActionsInline,
    joinProjectInline,
    memberActionsInline,
    getKeyboardByRole,
    getManagerMenuKeyboard
}; 