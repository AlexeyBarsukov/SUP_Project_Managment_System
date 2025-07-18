const Project = require('../../db/models/Project');
const User = require('../../db/models/User');
const AuditLog = require('../../db/models/AuditLog');
const ManagerInvitation = require('../../db/models/ManagerInvitation');
const ProjectManager = require('../../db/models/ProjectManager');
const ProjectRole = require('../../db/models/ProjectRole');
const { validateProject, validateProjectId, validateProjectName, validateProjectDescription } = require('../../utils/validation');
const { 
    projectManagementKeyboard, 
    projectStatusKeyboard,
    confirmationKeyboard,
    projectActionsInline,
    getKeyboardByRole
} = require('../keyboards');
const { 
    notifyProjectCreated, 
    notifyJoinRequest, 
    notifyAddedToProject,
    notifyRemovedFromProject,
    notifyProjectStatusChanged,
    notifyProjectActivity
} = require('../../utils/notifications');

const cancelKeyboard = { reply_markup: { keyboard: [['❌ Отменить']], resize_keyboard: true, one_time_keyboard: true } };

// Создание проекта (только для заказчиков)
const createProject = async (ctx) => {
    try {
        // Проверяем, что пользователь заказчик
        if (ctx.user.main_role !== 'customer') {
            return ctx.reply('❌ Создавать проекты могут только заказчики.');
        }

        // Начинаем процесс создания проекта
        ctx.session = ctx.session || {};
        ctx.session.creatingProject = true;
        ctx.session.projectData = {};

        await ctx.reply(
            '📝 <b>Создание нового проекта</b>\n\n' +
            'Введите название проекта (максимум 100 символов):',
            { parse_mode: 'HTML' }
        );

    } catch (error) {
        console.error('Error in createProject:', error);
        await ctx.reply('❌ Произошла ошибка при создании проекта.');
    }
};

// Просмотр проектов пользователя
const myProjects = async (ctx) => {
    ctx.message.handled = true; // Помечаем сообщение как обработанное
    try {
        if (!ctx.user) {
            return ctx.reply('Пользователь не найден. Используйте /start');
        }
        if (!ctx.user?.main_role) {
            return ctx.reply('У вас не выбрана роль. Используйте /start');
        }
        
        // Проверяем заполненность профиля для менеджера
        if (ctx.user.main_role === 'manager') {
            const isProfileComplete = await User.isManagerProfileFullyComplete(ctx.user.telegram_id);
            if (!isProfileComplete) {
                return ctx.reply(
                    '⚠️ <b>Для доступа к проектам необходимо заполнить профиль менеджера!</b>\n\n' +
                    'Используйте кнопку "📝 Заполнить профиль" для продолжения работы.',
                    { parse_mode: 'HTML' }
                );
            }
        }
        
        let projects = [];

        if (ctx.user.main_role === 'customer') {
            projects = await Project.findByCustomerId(ctx.user.id);
        } else if (ctx.user.main_role === 'manager') {
            projects = await Project.findByManagerId(ctx.user.id);
        } else {
            projects = await Project.findByMemberId(ctx.user.id);
        }

        if (projects.length === 0) {
            return ctx.reply(
                '📋 <b>У вас пока нет проектов</b>\n\n' +
                (ctx.user.main_role === 'customer' 
                    ? 'Создайте первый проект, используя кнопку "➕ Создать проект"'
                    : ctx.user.main_role === 'manager'
                        ? 'Вы пока не назначены менеджером ни в одном проекте'
                        : 'Присоединитесь к проекту, используя кнопку "🔍 Доступные проекты"'),
                { parse_mode: 'HTML' }
            );
        }

        const statusNames = {
            'draft': '📝 Черновик',
            'active': '🚀 Активный',
            'archived': '📦 Архив',
            'searching_manager': '🔍 Поиск менеджера',
            'searching_executors': '🔍 Поиск исполнителей',
            'in_progress': '🚧 В работе'
        };

        let message = '📋 <b>Ваши проекты:</b>\n\n';
        const buttons = [];
        for (const project of projects) {
            message += `<b>Проект находится в статусе:</b> ${statusNames[project.status] || '❓ Неизвестный статус'}\n`;
            message += `<b>Название проекта:</b> ${project.projectName || project.name}\n`;
            message += `🆔 ID: ${project.id}\n`;
            if (ctx.user.main_role === 'customer') {
                message += `👤 Роль: Заказчик\n`;
                // Показываем менеджера для заказчика
                const managers = await ProjectManager.findByProject(project.id);
                let acceptedManagers = [];
                let pendingManagers = [];
                
                for (const m of managers) {
                    if (m.status === 'accepted') acceptedManagers.push(m);
                    if (m.status === 'pending') pendingManagers.push(m);
                }
                
                if (acceptedManagers.length > 0) {
                    // Есть принятые менеджеры
                    for (const m of acceptedManagers) {
                        const user = await User.findById(m.manager_id);
                        if (user && user.username) {
                            message += `👨‍💼 <b>Менеджер:</b> @${user.username}\n`;
                        } else if (user) {
                            message += `👨‍💼 <b>Менеджер:</b> ${user.first_name || 'Неизвестно'}\n`;
                        }
                    }
                } else if (pendingManagers.length > 0) {
                    // Есть менеджеры на рассмотрении
                    for (const m of pendingManagers) {
                        const user = await User.findById(m.manager_id);
                        if (user && user.username) {
                            message += `👨‍💼 <b>Менеджер:</b> @${user.username} (на рассмотрении)\n`;
                        } else if (user) {
                            message += `👨‍💼 <b>Менеджер:</b> ${user.first_name || 'Неизвестно'} (на рассмотрении)\n`;
                        }
                    }
                } else {
                    // Нет менеджеров - заказчик сам менеджер
                    message += `👨‍💼 <b>Менеджер:</b> Вы сами менеджер на своем проекте\n`;
                }
            } else if (ctx.user.main_role === 'manager') {
                message += `👤 Ваша роль: Менеджер\n`;
                // Получаем всех менеджеров проекта
                const managers = await ProjectManager.findByProject(project.id);
                // Исключаем текущего пользователя
                const otherManagers = managers.filter(m => m.manager_id !== ctx.user.id && (m.status === 'accepted' || m.status === 'pending'));
                if (otherManagers.length > 0) {
                    let nicks = [];
                    for (const m of otherManagers) {
                        const user = await User.findById(m.manager_id);
                        if (user && user.username) nicks.push(`@${user.username}`);
                    }
                    if (nicks.length > 0) {
                        message += `👨‍💼 Другие менеджеры: ${nicks.join(', ')}\n`;
                    } else {
                        message += `👨‍💼 Другие менеджеры: Вы единственный менеджер на проекте\n`;
                    }
                } else {
                    message += `👨‍💼 Вы единственный менеджер на проекте\n`;
                }
                // Заказчик
                const customer = await User.findById(project.customer_id);
                if (customer && customer.username) {
                    message += `👤 Заказчик: @${customer.username}\n`;
                } else if (customer) {
                    message += `👤 Заказчик: ${customer.first_name || 'Неизвестно'}\n`;
                }
            } else if (project.member_role) {
                message += `👤 Роль: ${project.member_role === 'manager' ? 'Менеджер' : 'Исполнитель'}\n`;
                // Показываем менеджера для исполнителей
                const managers = await ProjectManager.findByProject(project.id);
                let acceptedManagers = [];
                let pendingManagers = [];
                
                for (const m of managers) {
                    if (m.status === 'accepted') acceptedManagers.push(m);
                    if (m.status === 'pending') pendingManagers.push(m);
                }
                
                if (acceptedManagers.length > 0) {
                    // Есть принятые менеджеры
                    for (const m of acceptedManagers) {
                        const user = await User.findById(m.manager_id);
                        if (user && user.username) {
                            message += `👨‍💼 <b>Менеджер:</b> @${user.username}\n`;
                        } else if (user) {
                            message += `👨‍💼 <b>Менеджер:</b> ${user.first_name || 'Неизвестно'}\n`;
                        }
                    }
                } else if (pendingManagers.length > 0) {
                    // Есть менеджеры на рассмотрении
                    for (const m of pendingManagers) {
                        const user = await User.findById(m.manager_id);
                        if (user && user.username) {
                            message += `👨‍💼 <b>Менеджер:</b> @${user.username} (на рассмотрении)\n`;
                        } else if (user) {
                            message += `👨‍💼 <b>Менеджер:</b> ${user.first_name || 'Неизвестно'} (на рассмотрении)\n`;
                        }
                    }
                } else {
                    // Нет менеджеров - заказчик сам менеджер
                    const customer = await User.findById(project.customer_id);
                    if (customer && customer.username) {
                        message += `👨‍💼 <b>Менеджер:</b> @${customer.username} (заказчик)\n`;
                    } else if (customer) {
                        message += `👨‍💼 <b>Менеджер:</b> ${customer.first_name || 'Неизвестно'} (заказчик)\n`;
                    }
                }
            }
            message += `📅 Создан: ${new Date(project.created_at).toLocaleDateString('ru-RU')}\n\n`;
            // Подсказка об удалении только для заказчика
            if (ctx.user.main_role === 'customer') {
                message += 'Используйте команду /delete_project_[ID] для удаления проекта.\n\n';
            }
            // Добавляем кнопку для каждого проекта
            buttons.push([
                { text: `Подробнее (${project.name})`, callback_data: `project_details_${project.id}` }
            ]);
        }

        await ctx.reply(message, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: buttons }
        });

    } catch (error) {
        console.error('[myProjects] Error:', error);
        await ctx.reply('❌ Произошла ошибка при загрузке проектов.');
    }
};

// Просмотр деталей проекта
const projectDetails = async (ctx) => {
    try {
        console.log('=== PROJECT DETAILS START ===');
        console.log('Params:', ctx.params);
        
        const projectId = parseInt(ctx.params[0]);
        // Валидируем ID проекта
        const validation = validateProjectId(projectId);
        if (!validation.isValid) {
            return ctx.reply(`❌ ${validation.error}`);
        }

        const project = await Project.findById(validation.id);
        
        if (!project) {
            return ctx.reply('❌ Проект не найден.');
        }

        // Проверяем права доступа
        const hasAccess = project.customer_id === ctx.user.id || 
                         await Project.getMembers(project.id).then(members => 
                             members.some(m => m.id === ctx.user.id)
                         );

        if (!hasAccess) {
            return ctx.reply('❌ У вас нет доступа к этому проекту.');
        }

        const statusNames = {
            'draft': '📝 Черновик',
            'active': '🚀 Активный',
            'archived': '📦 Архив',
            'searching_manager': '🔍 Поиск менеджера',
            'searching_executors': '🔍 Поиск исполнителей',
            'in_progress': '🚧 В работе'
        };

        const roleNames = {
            'customer': 'Заказчик',
            'manager': 'Менеджер',
            'executor': 'Исполнитель'
        };

        let message = `📋 <b>Проект: ${project.name}</b>\n\n`;
        message += `📝 <b>Описание:</b> ${project.description}\n`;
        
        // --- Блок отображения менеджера ---
        const managers = await ProjectManager.findByProject(project.id);
        let acceptedManagers = [];
        let pendingManagers = [];
        
        for (const m of managers) {
            if (m.status === 'accepted') acceptedManagers.push(m);
            if (m.status === 'pending') pendingManagers.push(m);
        }
        
        // Определяем, есть ли менеджер у проекта
        if (acceptedManagers.length > 0) {
            // Есть принятые менеджеры
            for (const m of acceptedManagers) {
                const user = await User.findById(m.manager_id);
                if (user && user.username) {
                    message += `👨‍💼 <b>Менеджер:</b> @${user.username}\n`;
                } else if (user) {
                    message += `👨‍💼 <b>Менеджер:</b> ${user.first_name || 'Неизвестно'}\n`;
                }
            }
        } else if (pendingManagers.length > 0) {
            // Есть менеджеры на рассмотрении
            for (const m of pendingManagers) {
                const user = await User.findById(m.manager_id);
                if (user && user.username) {
                    message += `👨‍💼 <b>Менеджер:</b> @${user.username} (на рассмотрении)\n`;
                } else if (user) {
                    message += `👨‍💼 <b>Менеджер:</b> ${user.first_name || 'Неизвестно'} (на рассмотрении)\n`;
                }
            }
        } else {
            // Нет менеджеров - заказчик сам менеджер
            message += `👨‍💼 <b>Менеджер:</b> Вы сами менеджер на своем проекте\n`;
        }
        
        // --- Статус проекта ---
        let statusText = '';
        if (project.status === 'searching_manager') statusText = 'В поисках менеджера';
        else if (project.status === 'searching_executors') statusText = 'В поисках исполнителей';
        else if (project.status === 'active' || project.status === 'in_progress') statusText = 'В работе';
        else if (project.status === 'draft') statusText = 'Черновик';
        else statusText = project.status;
        message += `📊 <b>Статус:</b> ${statusText}\n\n`;

        // --- Показываем только заполненные поля проекта ---
        function isFilled(val) {
            if (!val) return false;
            const v = String(val).trim().toLowerCase();
            return v && v !== '...' && v !== 'нет';
        }
        if (isFilled(project.deadline)) message += `⏰ <b>Сроки:</b> ${project.deadline}\n`;
        if (isFilled(project.budget)) message += `💰 <b>Бюджет:</b> ${project.budget}\n`;
        
        // Добавляем требования к менеджеру
        if (project.manager_requirements) {
            message += `📋 <b>Требования к менеджеру:</b>\n${project.manager_requirements}\n`;
        } else {
            message += `📋 <b>Требования к менеджеру:</b> не указаны\n`;
        }
        
        // Добавляем условия работы
        if (project.work_conditions) {
            message += `⚙️ <b>Условия работы:</b>\n${project.work_conditions}\n`;
        } else {
            message += `⚙️ <b>Условия работы:</b> не указаны\n`;
        }
        
        // Добавляем дополнительные пожелания
        if (project.additional_notes) {
            message += `💡 <b>Дополнительные пожелания:</b>\n${project.additional_notes}\n`;
        } else {
            message += `💡 <b>Дополнительные пожелания:</b> нет\n`;
        }
        // --- конец блока ---

        // Показываем вакансии проекта с информацией об исполнителях
        const projectRoles = await ProjectRole.findByProjectId(project.id);
        if (projectRoles.length > 0) {
            message += '\n👥 <b>Вакансии проекта:</b>\n';
            for (const role of projectRoles) {
                const availablePositions = role.positions_count - role.filled_positions;
                message += `\n🔹 <b>${role.role_name}</b>\n`;
                message += `   📊 Позиций: ${role.filled_positions}/${role.positions_count} (доступно: ${availablePositions})\n`;
                if (role.required_skills) {
                    message += `   🛠 Навыки: ${role.required_skills}\n`;
                }
                if (role.salary_range) {
                    message += `   💰 Зарплата: ${role.salary_range}\n`;
                }
                if (role.description) {
                    message += `   📝 Описание: ${role.description}\n`;
                }
                
                // Показываем исполнителей для этой роли
                const ExecutorApplication = require('../../db/models/ExecutorApplication');
                const acceptedApplications = await ExecutorApplication.findAcceptedByRoleId(role.id);
                if (acceptedApplications.length > 0) {
                    message += `   👥 <b>Исполнители:</b>\n`;
                    for (const app of acceptedApplications) {
                        const executor = await User.findById(app.executor_id);
                        if (executor) {
                            message += `      • ${executor.first_name} ${executor.last_name || ''} (@${executor.username})\n`;
                        }
                    }
                }
            }
        } else if (project.status === 'searching_executors') {
            message += '\n👥 <b>Вакансии проекта:</b> Не созданы\n';
        }

        // --- Действия для заказчика (управление менеджерами) ---
        if (project.customer_id === ctx.user.id) {
            let managerButtons = [];
            
            // Получаем всех менеджеров проекта
            const allManagers = await ProjectManager.findByProject(project.id);
            const acceptedManagers = allManagers.filter(m => m.status === 'accepted');
            const pendingManagers = allManagers.filter(m => m.status === 'pending');
            const totalManagers = acceptedManagers.length + pendingManagers.length;
            
            // Проверяем, является ли заказчик менеджером
            const isCustomerManager = acceptedManagers.some(m => m.manager_id === ctx.user.id);
            

            
            // Кнопки управления менеджерами показываем только при определенных статусах
            const allowedStatuses = ['active', 'searching_executors'];
            if (allowedStatuses.includes(project.status)) {
                
                // Кнопка "Убрать менеджера" - показываем только если есть принятые менеджеры, кроме заказчика
                const otherManagers = acceptedManagers.filter(m => m.manager_id !== ctx.user.id);
                if (otherManagers.length > 0) {
                    managerButtons.push([
                        { text: '❌ Убрать менеджера', callback_data: `remove_manager_${project.id}` }
                    ]);
                }
                
                // Кнопка "Сменить менеджера" - показываем только если есть принятые менеджеры
                if (acceptedManagers.length > 0) {
                    managerButtons.push([
                        { text: '🔄 Сменить менеджера', callback_data: `change_manager_${project.id}` }
                    ]);
                }
                
                // Кнопка "Добавить менеджера" - показываем только если меньше 3 менеджеров
                if (totalManagers < 3) {
                    managerButtons.push([
                        { text: `➕ Добавить менеджера (${totalManagers}/3)`, callback_data: `add_manager_${project.id}` }
                    ]);
                    // Добавляем кнопку поиска по никнейму
                    managerButtons.push([
                        { text: '🔍 Найти по никнейму', callback_data: `search_manager_${project.id}` }
                    ]);
                }
                
                // Кнопка "Назначить менеджера" - показываем если нет других менеджеров (кроме заказчика)
                if (otherManagers.length === 0 && totalManagers < 3) {
                    managerButtons.push([
                        { text: '👨‍💼 Назначить менеджера', callback_data: `assign_manager_${project.id}` }
                    ]);
                }
                
                // ОТЛАДОЧНАЯ ИНФОРМАЦИЯ ДЛЯ КНОПОК
                console.log('Other managers:', otherManagers);
                console.log('Other managers length:', otherManagers.length);
                console.log('Total managers < 3?', totalManagers < 3);
                console.log('Should show assign button?', otherManagers.length === 0 && totalManagers < 3);
                console.log('Manager buttons:', managerButtons);
                console.log('=== END DEBUG ===');
            } else {
                // Добавляем информационное сообщение о недоступности управления менеджерами
                const statusName = statusNames[project.status] || project.status;
                message += `\n\nℹ️ <b>Управление менеджерами недоступно</b>\n` +
                          `Кнопки управления менеджерами отображаются только для проектов в статусе "Активный" или "Поиск исполнителей".\n` +
                          `Текущий статус: <b>${statusName}</b>`;
            }
            
            // Добавляем кнопки управления проектом (всегда доступны заказчику)
            managerButtons.push([
                { text: '📊 Изменить статус', callback_data: `change_status_${project.id}` },
                { text: '🗑️ Удалить проект', callback_data: `delete_project_${project.id}` }
            ]);
            
            // Если заказчик является менеджером, добавляем кнопки менеджера
            if (isCustomerManager) {
                // Кнопки управления вакансиями (только для проектов в поиске исполнителей)
                if (project.status === 'searching_executors') {
                    if (projectRoles.length > 0) {
                        // Если есть вакансии, показываем кнопки управления
                        managerButtons.push([
                            { text: '👥 Просмотр вакансий', callback_data: `view_vacancies_${project.id}` }
                        ]);
                        managerButtons.push([
                            { text: '➕ Добавить вакансию', callback_data: `add_vacancies_${project.id}` }
                        ]);
                        managerButtons.push([
                            { text: '✏️ Редактировать вакансии', callback_data: `edit_vacancies_${project.id}` }
                        ]);
                    } else {
                        // Если нет вакансий, показываем только кнопку добавления
                        managerButtons.push([
                            { text: '👥 Создать вакансии', callback_data: `add_vacancies_${project.id}` }
                        ]);
                    }
                    
                    // Добавляем кнопку просмотра откликов
                    managerButtons.push([
                        { text: '📋 Просмотр откликов', callback_data: `view_applications_${project.id}` }
                    ]);
                    
                    // Добавляем кнопку поиска исполнителей (только если есть свободные позиции)
                    const hasAvailablePositions = projectRoles.some(role => 
                        role.positions_count > role.filled_positions
                    );
                    if (hasAvailablePositions) {
                        managerButtons.push([
                            { text: '🔍 Искать исполнителей', callback_data: `search_executors_${project.id}` }
                        ]);
                    }
                    
                    // Добавляем кнопку настроек повторных откликов
                    managerButtons.push([
                        { text: '⚙️ Настройки повторных откликов', callback_data: `reapply_settings_${project.id}` }
                    ]);
                } else {
                    // Если проект не в статусе поиска исполнителей, показываем информационное сообщение
                    const statusName = statusNames[project.status] || project.status;
                    message += `\n\nℹ️ <b>Управление вакансиями недоступно</b>\n` +
                              `Кнопки управления вакансиями отображаются только для проектов в статусе "Поиск исполнителей".\n` +
                              `Текущий статус: <b>${statusName}</b>`;
                }
            }
            
            await ctx.reply(message, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: managerButtons
                }
            });
            return;
        }
        
        // --- Действия для менеджера ---
        if (
            pendingManagers.length > 0 &&
            pendingManagers.some(m => m.manager_id === ctx.user.id)
        ) {
            // Только приглашённый менеджер видит эти кнопки
            await ctx.reply(message, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '📋 Подробнее о проекте и условиях', callback_data: `project_preview_${project.id}` }
                        ],
                        [
                            { text: '✅ Согласиться', callback_data: `accept_invite_${project.id}` },
                            { text: '❌ Отказаться', callback_data: `decline_invite_${project.id}` }
                        ]
                    ]
                }
            });
            return;
        }
        
        // --- Действия для принятого менеджера ---
        if (
            acceptedManagers.length > 0 &&
            acceptedManagers.some(m => m.manager_id === ctx.user.id)
        ) {
            // Проверяем ограничения
            const canLeave = project.status !== 'completed' && project.status !== 'archived';
            
            let managerButtons = [];
            
            // Кнопки управления вакансиями (только для проектов в поиске исполнителей)
            if (project.status === 'searching_executors') {
                if (projectRoles.length > 0) {
                    // Если есть вакансии, показываем кнопки управления
                    managerButtons.push([
                        { text: '👥 Просмотр вакансий', callback_data: `view_vacancies_${project.id}` }
                    ]);
                    managerButtons.push([
                        { text: '➕ Добавить вакансию', callback_data: `add_vacancies_${project.id}` }
                    ]);
                    managerButtons.push([
                        { text: '✏️ Редактировать вакансии', callback_data: `edit_vacancies_${project.id}` }
                    ]);
                } else {
                    // Если нет вакансий, показываем только кнопку добавления
                    managerButtons.push([
                        { text: '👥 Создать вакансии', callback_data: `add_vacancies_${project.id}` }
                    ]);
                }
                
                // Добавляем кнопку просмотра откликов
                managerButtons.push([
                    { text: '📋 Просмотр откликов', callback_data: `view_applications_${project.id}` }
                ]);
                
                // Добавляем кнопку поиска исполнителей (только если есть свободные позиции)
                const hasAvailablePositions = projectRoles.some(role => 
                    role.positions_count > role.filled_positions
                );
                if (hasAvailablePositions) {
                    managerButtons.push([
                        { text: '🔍 Искать исполнителей', callback_data: `search_executors_${project.id}` }
                    ]);
                }
                
                // Добавляем кнопку настроек повторных откликов
                managerButtons.push([
                    { text: '⚙️ Настройки повторных откликов', callback_data: `reapply_settings_${project.id}` }
                ]);
            }
            
            if (canLeave) {
                managerButtons.push([
                    { text: '🚪 Покинуть проект', callback_data: `leave_project_${project.id}` }
                ]);
            }
            
            // Если есть кнопки, показываем их
            if (managerButtons.length > 0) {
                await ctx.reply(message, {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: managerButtons
                    }
                });
                return;
            }
        }
        
        // --- Действия для участников проекта (менеджеров и исполнителей) ---
        const userMember = projectMembers.find(m => m.id === ctx.user.id);
        
        if (userMember && userMember.member_role !== 'customer') {
            // Проверяем, что пользователь не является заказчиком
            if (project.customer_id !== ctx.user.id) {
                // Проверяем ограничения для отказа
                const canDecline = project.status !== 'completed' && project.status !== 'archived';
                
                if (canDecline) {
                    const roleText = userMember.member_role === 'manager' ? 'менеджера' : 'исполнителя';
                    
                    await ctx.reply(message, {
                        parse_mode: 'HTML',
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    { text: `❌ Отказаться от участия`, callback_data: `decline_invite_${project.id}` }
                                ]
                            ]
                        }
                    });
                    return;
                }
            }
        }
        
        // --- Для всех остальных ---
        await ctx.reply(message, { parse_mode: 'HTML' });
        return;

    } catch (error) {
        console.error('Error in projectDetails:', error);
        await ctx.reply('❌ Произошла ошибка при загрузке проекта.');
    }
};

// --- Новый пошаговый workflow создания проекта ---

// Старт создания проекта
const startCreateProject = async (ctx) => {
    try {
        ctx.session = ctx.session || {};
        ctx.session.createProject = {
            step: 'name',
            data: {}
        };
        
        await ctx.reply('📝 Введите название проекта (от 3 до 100 символов):', cancelKeyboard);
    } catch (error) {
        console.error('[startCreateProject] Error:', error);
        await ctx.reply('❌ Произошла ошибка при создании проекта. Попробуйте еще раз.');
    }
};

// Обработка шагов создания проекта
const handleCreateProjectStep = async (ctx) => {
    if (!ctx.user) {
        ctx.user = await User.findByTelegramId(ctx.from.id);
    }
    ctx.session = ctx.session || {};
    const state = ctx.session.createProject;
    if (!state) return;

    // Отмена
    if (ctx.message.text === '❌ Отменить' || ctx.message.text === '/cancel') {
        delete ctx.session.createProject;
        await ctx.reply('❌ Создание проекта отменено.', {
            reply_markup: getKeyboardByRole(ctx.user.main_role).reply_markup
        });
        return;
    }

    switch (state.step) {
        case 'name': {
            const projectName = ctx.message.text.trim();
            const validation = validateProjectName(projectName);
            if (!validation.isValid) {
                return ctx.reply(`❌ ${validation.error}\nПопробуйте снова:`, cancelKeyboard);
            }
            state.data.projectName = projectName;
            state.step = 'description';
            return ctx.reply('✏️ Введите описание проекта (до 2000 символов):', cancelKeyboard);
        }
        case 'description': {
            const description = ctx.message.text.trim();
            const validation = validateProjectDescription(description);
            if (!validation.isValid) {
                return ctx.reply(`❌ ${validation.error}\nПопробуйте снова:`, cancelKeyboard);
            }
            state.data.description = description;
            state.step = 'add_manager';
            return ctx.reply('Добавить дополнительного менеджера? (Да/Нет)', { ...confirmationKeyboard, ...cancelKeyboard });
        }
        case 'add_manager': {
            const answer = ctx.message.text.toLowerCase();
            if (answer === 'да' || answer === 'yes') {
                // Показываем список доступных менеджеров (исключая заказчика)
                let managers = await User.findVisibleByRole('manager');
                if (!managers || managers.length === 0) {
                    await ctx.reply(
                        'В системе пока нет доступных менеджеров с открытым профилем.\n' +
                        'Вы сможете добавить их позже через редактирование проекта.',
                        cancelKeyboard
                    );
                    state.step = 'confirm';
                    return showProjectSummary(ctx);
                } else {
                    // Исключаем заказчика из списка
                    managers = managers.filter(m => m.id !== ctx.user.id);
                    let list = 'Список доступных менеджеров:\n';
                    for (const m of managers) {
                        let desc = [];
                        if (m.specialization) desc.push(m.specialization);
                        if (m.experience) desc.push(m.experience);
                        if (m.skills) {
                            let skills = m.skills;
                            if (typeof skills === 'string') {
                                try {
                                    const arr = JSON.parse(skills);
                                    if (Array.isArray(arr)) skills = arr.join(', ');
                                } catch { /* ignore */ }
                            }
                            desc.push(`Навыки: ${skills}`);
                        }
                        if (m.achievements) desc.push(`Достижения: ${m.achievements}`);
                        list += `• @${m.username} — ${m.first_name || ''} ${m.last_name || ''}`;
                        if (desc.length) list += `\n   ${desc.join(' | ')}`;
                        
                        // Добавляем зарплату и контакты
                        let additionalInfo = [];
                        if (m.salary_range) additionalInfo.push(`💸 Зарплата: ${m.salary_range}`);
                        if (m.contacts) additionalInfo.push(`📞 Контакты: ${m.contacts}`);
                        
                        if (additionalInfo.length > 0) {
                            list += `\n   ${additionalInfo.join(' | ')}`;
                        }
                        
                        list += '\n';
                    }
                    if (managers.length === 0) {
                        list += '\nНет других менеджеров, кроме вас.\n';
                    }
                    list += '\nВведите username дополнительного менеджера через @:';
                    state.step = 'manager_input';
                    return ctx.reply(list, cancelKeyboard);
                }
            } else if (answer === 'нет' || answer === 'no') {
                state.step = 'confirm';
                return showProjectSummary(ctx);
            } else {
                return ctx.reply('Пожалуйста, ответьте "Да" или "Нет".', cancelKeyboard);
            }
        }
        case 'manager_input': {
            const username = ctx.message.text.trim();
            // Валидация формата username
            if (!username.startsWith('@') || username.length < 5 || !/^@[A-Za-z0-9_]+$/.test(username)) {
                return ctx.reply('❌ Введите username менеджера через @ (минимум 5 символов, только буквы, цифры и _).', cancelKeyboard);
            }
            // Если заказчик выбрал себя как менеджера
            if (username.replace('@', '') === ctx.user.username) {
                state.data.manager = username;
                state.data.selfManager = true;
                state.step = 'confirm';
                return showProjectSummary(ctx);
            }
            // Проверка наличия менеджера в списке доступных
            let managers = await User.findVisibleByRole('manager');
            managers = managers.filter(m => m.id !== ctx.user.id);
            const found = managers.find(m => m.username && ('@' + m.username.toLowerCase()) === username.toLowerCase());
            if (!found) {
                let list = '❌ Менеджера с таким username нет в списке. Проверьте написание или выберите из доступных.\n\n';
                list += 'Доступные менеджеры:\n';
                for (const m of managers) {
                    list += `• @${m.username} — ${m.first_name || ''} ${m.last_name || ''}\n`;
                }
                return ctx.reply(list, cancelKeyboard);
            }
            state.data.manager = username;
            state.data.selfManager = false;
            // После выбора менеджера — спрашиваем сроки
            state.step = 'deadline';
            return ctx.reply('Укажите сроки выполнения проекта (например: "до 30.07.2025" или "3 недели"):', cancelKeyboard);
        }
        case 'deadline': {
            state.data.deadline = ctx.message.text.trim();
            state.step = 'budget';
            return ctx.reply('Укажите сколько готовы платить менеджеру (например: "100 000 руб." или "по договорённости"):', cancelKeyboard);
        }
        case 'budget': {
            state.data.budget = ctx.message.text.trim();
            state.step = 'manager_requirements';
            return ctx.reply('Опишите требования к менеджеру (например: опыт, навыки, специализация):', cancelKeyboard);
        }
        case 'manager_requirements': {
            state.data.manager_requirements = ctx.message.text.trim();
            state.step = 'work_conditions';
            return ctx.reply('Опишите условия работы (например: удалённо, гибкий график, оплата по этапам):', cancelKeyboard);
        }
        case 'work_conditions': {
            state.data.work_conditions = ctx.message.text.trim();
            state.step = 'additional_notes';
            return ctx.reply('Дополнительные пожелания (если есть):', cancelKeyboard);
        }
        case 'additional_notes': {
            state.data.additional_notes = ctx.message.text.trim();
            state.step = 'confirm';
            return showProjectSummary(ctx);
        }
        case 'confirm': {
            const answer = ctx.message.text.toLowerCase();
            if (answer === 'да' || answer === 'yes') {
                await saveProject(ctx);
                delete ctx.session.createProject;
                return;
            } else if (answer === 'нет' || answer === 'no') {
                delete ctx.session.createProject;
                await ctx.reply('❌ Создание проекта отменено.', {
                    reply_markup: getKeyboardByRole(ctx.user.main_role).reply_markup
                });
                return;
            } else {
                return ctx.reply('Пожалуйста, ответьте "Да" или "Нет".', cancelKeyboard);
            }
        }
    }
};

// Показывает сводку перед созданием
async function showProjectSummary(ctx) {
    const state = ctx.session.createProject;
    const d = state.data;
    let summary = `📋 <b>Проверьте данные проекта:</b>\n\n`;
    summary += `Название: <b>${d.projectName}</b>\n`;
    summary += `Описание: ${d.description}\n`;
    if (d.deadline) summary += `Сроки: ${d.deadline}\n`;
    if (d.budget) summary += `Бюджет: ${d.budget}\n`;
    if (d.manager_requirements) summary += `Требования к менеджеру: ${d.manager_requirements}\n`;
    if (d.work_conditions) summary += `Условия работы: ${d.work_conditions}\n`;
    if (d.additional_notes) summary += `Доп. пожелания: ${d.additional_notes}\n`;
    if (d.manager) {
        summary += `Доп. менеджер: ${d.manager}\n`;
    }
    summary += '\nСоздать проект? (Да/Нет)';
    await ctx.reply(summary, { parse_mode: 'HTML' });
}



// TODO: Обернуть saveProject в транзакцию для атомарности операций создания проекта и ролей
async function saveProject(ctx) {
    try {
        console.log('[saveProject] Начало создания проекта для пользователя:', ctx.from?.id);
        console.log('[saveProject] Данные проекта:', JSON.stringify(ctx.session?.createProject?.data, null, 2));
        
        // Гарантированно получаем пользователя
        if (!ctx.user) {
            ctx.user = await User.findByTelegramId(ctx.from.id);
            if (!ctx.user) {
                throw new Error(`Пользователь ${ctx.from.id} не найден в базе`);
            }
        }
        
        const d = ctx.session.createProject.data;
        const userId = ctx.user.id || ctx.user.telegram_id || ctx.from.id;
        if (!userId) {
            throw new Error('Не удалось определить ID пользователя');
        }
        
        // Определяем статус проекта
        let projectStatus = 'draft';
        if (!d.manager) {
            projectStatus = 'searching_executors'; // Менеджер — заказчик, ищем исполнителей
        } else {
            projectStatus = 'searching_manager'; // Ждём согласия менеджера
        }
        
        // Создаем проект
        const project = await Project.create(
            d.projectName,
            d.description,
            userId,
            projectStatus,
            {
                deadline: d.deadline,
                budget: d.budget,
                manager_requirements: d.manager_requirements,
                work_conditions: d.work_conditions,
                additional_notes: d.additional_notes
            }
        );
        
        if (!project) throw new Error('Не удалось создать проект');
        
        // Добавляем роли
        await Project.addUserToProjectRoles(userId, project.id, 'customer');
        
        // Если менеджер не выбран — заказчик сразу становится менеджером
        if (!d.manager) {
            await Project.addUserToProjectRoles(userId, project.id, 'manager');
            await ProjectManager.create({ project_id: project.id, manager_id: userId, status: 'accepted' });
        }
        
        // Обработка менеджера
        if (d.manager) {
            const managerUser = await User.findByUsername(d.manager.replace('@', ''));
            if (managerUser) {
                if (d.selfManager) {
                    // Если заказчик выбрал себя как менеджера — сразу назначаем accepted и статус 'searching_executors'
                    await Project.addUserToProjectRoles(managerUser.id, project.id, 'manager');
                    await ProjectManager.create({ project_id: project.id, manager_id: managerUser.id, status: 'accepted' });
                    await Project.updateStatus(project.id, 'searching_executors');
                    await Project.addMember(project.id, ctx.user.id, 'manager');
                } else {
                    // Создаём приглашение
                    await ManagerInvitation.create({
                        project_id: project.id,
                        manager_telegram_id: managerUser.telegram_id,
                        customer_telegram_id: ctx.user.telegram_id || ctx.user.id || ctx.from.id
                    });
                    // ВАЖНО: создаём запись в project_managers со статусом pending
                    await ProjectManager.create({ project_id: project.id, manager_id: managerUser.id, status: 'pending' });
                    
                    // Отправляем уведомление менеджеру
                    await ctx.telegram.sendMessage(
                        managerUser.telegram_id,
                        `Вас пригласили в проект "${project.name}" от ${ctx.user.first_name} ${ctx.user.last_name || ''}\n\nБолее подробно о проекте можно посмотреть в разделе "Подробнее о проекте и условиях"`,
                        {
                            reply_markup: {
                                inline_keyboard: [
                                    [
                                        { text: '📋 Подробнее о проекте и условиях', callback_data: `project_preview_${project.id}` }
                                    ],
                                    [
                                        { text: '✅ Согласиться', callback_data: `accept_invite_${project.id}` },
                                        { text: '❌ Отказаться', callback_data: `decline_invite_${project.id}` }
                                    ]
                                ]
                            }
                        }
                    );
                }
            } else {
                console.log('[saveProject] Менеджер не найден:', d.manager);
            }
        }
        
        // Логирование и уведомления
        await AuditLog.logProjectCreated(userId, project.id, project.name);
        await notifyProjectCreated(ctx, project, ctx.user);
        
        // Очистка и ответ
        delete ctx.session.createProject;
        
        await ctx.reply(
            `✅ <b>Проект создан!</b>\n\n` +
            `Название: ${project.name}\n` +
            `ID: ${project.id}`,
            { 
                parse_mode: 'HTML',
                reply_markup: getKeyboardByRole(ctx.user.main_role).reply_markup
            }
        );
        
    } catch (error) {
        console.error('SaveProject error:', {
            error: error.message,
            stack: error.stack,
            userId: ctx.from?.id,
            session: ctx.session?.createProject
        });
        
        // Более информативные сообщения об ошибках
        let errorMessage = '❌ Ошибка при создании проекта. Попробуйте позже.';
        
        if (error.message.includes('ON CONFLICT')) {
            errorMessage = '❌ Ошибка базы данных: конфликт данных. Обратитесь к администратору.';
        } else if (error.message.includes('duplicate key')) {
            errorMessage = '❌ Проект с таким названием уже существует. Выберите другое название.';
        } else if (error.message.includes('foreign key')) {
            errorMessage = '❌ Ошибка: указанный менеджер не найден в системе.';
        } else if (error.message.includes('not found')) {
            errorMessage = '❌ Ошибка: пользователь не найден. Попробуйте перезапустить бота.';
        }
        
        await ctx.reply(errorMessage);
    }
}

// Удаление проекта
const deleteProject = async (ctx) => {
    try {
        if (!ctx.user) {
            return ctx.reply('❌ Пользователь не найден. Используйте /start');
        }

        // Получаем ID проекта из команды /delete_project_[ID]
        const projectId = parseInt(ctx.message.text.match(/\/delete_project_(\d+)/)?.[1]);
        
        if (!projectId) {
            return ctx.reply('❌ Неверный формат команды. Используйте /delete_project_[ID]');
        }

        // Проверяем существование проекта
        const project = await Project.findById(projectId);
        if (!project) {
            return ctx.reply('❌ Проект не найден.');
        }

        // Проверяем права доступа (только заказчик может удалять свои проекты)
        if (project.customer_id !== ctx.user.id) {
            return ctx.reply('❌ У вас нет прав для удаления этого проекта. Удалять проекты может только заказчик.');
        }

        // Проверяем, что проект не активен (можно удалять только черновики и архивы)
        if (project.status === 'active') {
            return ctx.reply('❌ Нельзя удалить активный проект. Сначала измените статус на "Архив".');
        }

        // Запрашиваем подтверждение с подробным предупреждением
        ctx.session = ctx.session || {};
        ctx.session.pendingDelete = {
            projectId: projectId,
            projectName: project.name
        };

        const warningMessage = 
            `🗑️ <b>Подтверждение удаления проекта</b>\n\n` +
            `📋 <b>Проект:</b> ${project.name}\n` +
            `🆔 <b>ID:</b> ${projectId}\n` +
            `📅 <b>Создан:</b> ${new Date(project.created_at).toLocaleDateString('ru-RU')}\n\n` +
            `⚠️ <b>ВНИМАНИЕ!</b> После удаления проекта:\n` +
            `• Все данные проекта будут безвозвратно удалены\n` +
            `• Информация о менеджерах и исполнителях будет стерта\n` +
            `• История чатов и сообщений будет удалена\n` +
            `• Аудит лог проекта будет очищен\n\n` +
            `🔒 <b>Это действие нельзя отменить!</b>\n\n` +
            `Для подтверждения удаления введите вручную:\n` +
            `<code>УДАЛИТЬ ${projectId}</code>\n\n` +
            `Для отмены введите:\n` +
            `<code>ОТМЕНА</code>`;

        await ctx.reply(warningMessage, {
            parse_mode: 'HTML',
            reply_markup: {
                keyboard: [
                    [`🗑️ Удалить ${projectId}`],
                    ['❌ Отменить удаление']
                ],
                resize_keyboard: true,
                one_time_keyboard: true
            }
        });
    } catch (error) {
        console.error('[deleteProject] Error:', error);
        await ctx.reply('❌ Произошла ошибка при удалении проекта.');
    }
};

// Обработка подтверждения удаления проекта
const handleDeleteConfirmation = async (ctx) => {
    try {
        if (!ctx.session?.pendingDelete) {
            return false; // Не обрабатываем, если нет ожидающего удаления
        }
        
        const { projectId, projectName } = ctx.session.pendingDelete;
        const userInput = ctx.message.text.trim().toLowerCase();
        
        // Проверяем отмену
        if (userInput === 'отмена' || userInput === 'cancel' || userInput === '❌ отменить удаление') {
            delete ctx.session.pendingDelete;
            await ctx.reply(
                '✅ Удаление проекта отменено.',
                { reply_markup: getKeyboardByRole(ctx.user.main_role).reply_markup }
            );
            return true;
        }
        
        // Проверяем подтверждение удаления через кнопку
        if (userInput === `🗑️ удалить ${projectId}`.toLowerCase()) {
            return await performProjectDeletion(ctx, projectId, projectName);
        }
        
        // Проверяем ручной ввод команды удаления
        if (userInput === `удалить ${projectId}`.toLowerCase()) {
            return await performProjectDeletion(ctx, projectId, projectName);
        }
        
        // Проверяем различные варианты подтверждения
        const confirmVariants = ['да', 'yes', 'подтверждаю', 'удалить', 'удаляй'];
        if (confirmVariants.includes(userInput)) {
            return await performProjectDeletion(ctx, projectId, projectName);
        }
        
        // Неверный ввод - показываем подсказку
        await ctx.reply(
            `❌ <b>Неверный ввод</b>\n\n` +
            `Для подтверждения удаления:\n` +
            `• Нажмите кнопку "🗑️ Удалить ${projectId}"\n` +
            `• Или введите вручную: <code>УДАЛИТЬ ${projectId}</code>\n` +
            `• Или просто: <code>да</code>, <code>yes</code>\n\n` +
            `Для отмены:\n` +
            `• Нажмите кнопку "❌ Отменить удаление"\n` +
            `• Или введите: <code>отмена</code>`,
            { 
                parse_mode: 'HTML',
                reply_markup: {
                    keyboard: [
                        [`🗑️ Удалить ${projectId}`],
                        ['❌ Отменить удаление']
                    ],
                    resize_keyboard: true,
                    one_time_keyboard: true
                }
            }
        );
        return true;
        
    } catch (error) {
        console.error('[handleDeleteConfirmation] Error:', error);
        await ctx.reply('❌ Произошла ошибка при удалении проекта.');
        delete ctx.session.pendingDelete;
        return true;
    }
};

// Вспомогательная функция для выполнения удаления проекта
const performProjectDeletion = async (ctx, projectId, projectName) => {
    try {
        // Сначала логируем операцию (до удаления проекта)
        await AuditLog.logProjectDeleted(ctx.user.id, projectId, projectName);
        
        // Затем выполняем удаление
        const success = await Project.delete(projectId, ctx.user.id);
        
        if (success) {
            delete ctx.session.pendingDelete;
            await ctx.reply(
                `✅ <b>Проект успешно удален!</b>\n\n` +
                `📋 Проект: ${projectName}\n` +
                `🆔 ID: ${projectId}\n\n` +
                `🗑️ Все данные проекта были безвозвратно удалены.`,
                { 
                    parse_mode: 'HTML',
                    reply_markup: getKeyboardByRole(ctx.user.main_role).reply_markup
                }
            );
        } else {
            await ctx.reply('❌ Не удалось удалить проект. Попробуйте позже.');
        }
        return true;
    } catch (error) {
        console.error('[performProjectDeletion] Error:', error);
        await ctx.reply('❌ Произошла ошибка при удалении проекта.');
        delete ctx.session.pendingDelete;
        return true;
    }
};

// Показать доступные проекты для исполнителей
const availableProjects = async (ctx) => {
    try {
        // Handle both text messages and callback queries
        const messageText = ctx.message?.text || ctx.callbackQuery?.data || 'Unknown';
        console.log('[availableProjects] START - message:', messageText);
        
        if (!ctx.user) {
            return ctx.reply('Пользователь не найден. Используйте /start');
        }

        // Проверяем заполненность профиля для менеджера
        if (ctx.user.main_role === 'manager') {
            const isProfileComplete = await User.isManagerProfileFullyComplete(ctx.user.telegram_id);
            if (!isProfileComplete) {
                return ctx.reply(
                    '⚠️ <b>Для доступа к проектам необходимо заполнить профиль менеджера!</b>\n\n' +
                    'Используйте кнопку "📝 Заполнить профиль" для продолжения работы.',
                    { parse_mode: 'HTML' }
                );
            }
        }

        // If this is a callback query, answer it first
        if (ctx.callbackQuery) {
            await ctx.answerCbQuery();
        }

        // Получаем проекты, доступные для исполнителей
        const projects = await Project.findAvailableForExecutors();

        if (projects.length === 0) {
            const noProjectsMessage = '🔍 <b>Доступных проектов пока нет</b>\n\n' +
                'Проекты со статусом "В поисках исполнителей" появятся здесь, когда заказчики их создадут.';
            
            if (ctx.callbackQuery) {
                return ctx.editMessageText(noProjectsMessage, { parse_mode: 'HTML' });
            } else {
                return ctx.reply(noProjectsMessage, { parse_mode: 'HTML' });
            }
        }

        let message = '🔍 <b>Доступные проекты:</b>\n\n';
        
        for (const project of projects) {
            message += `📋 <b>${project.name}</b>\n`;
            message += `🆔 ID: ${project.id}\n`;
            
            if (project.description) {
                // Обрезаем описание, если оно слишком длинное
                const shortDescription = project.description.length > 100 
                    ? project.description.substring(0, 100) + '...' 
                    : project.description;
                message += `📝 ${shortDescription}\n`;
            }
            
            if (project.budget) {
                message += `💰 <b>Бюджет:</b> ${project.budget}\n`;
            }
            
            if (project.deadline) {
                message += `⏰ <b>Срок:</b> ${project.deadline}\n`;
            }
            
            // Показываем заказчика
            const customerName = project.customer_username 
                ? `@${project.customer_username}` 
                : project.customer_first_name || 'Неизвестно';
            message += `👤 <b>Заказчик:</b> ${customerName}\n`;
            
            message += `📅 <b>Создан:</b> ${new Date(project.created_at).toLocaleDateString('ru-RU')}\n`;
            message += `\n`;
        }

        // Добавляем информацию о том, как откликнуться
        message += `💡 <b>Как откликнуться:</b>\n`;
        message += `• Нажмите на ID проекта для просмотра деталей\n`;
        message += `• Или используйте команду: <code>/project [ID]</code>\n`;
        message += `• Например: <code>/project ${projects[0].id}</code>`;

        const replyMarkup = {
            inline_keyboard: [
                [
                    { text: '🔄 Обновить список', callback_data: 'refresh_available_projects' }
                ]
            ]
        };

        // Добавляем кнопки для каждого проекта
        for (const project of projects) {
            replyMarkup.inline_keyboard.unshift([
                { text: `📋 ${project.name} (ID: ${project.id})`, callback_data: `project_details_${project.id}` }
            ]);
        }

        if (ctx.callbackQuery) {
            await ctx.editMessageText(message, {
                parse_mode: 'HTML',
                reply_markup: replyMarkup
            });
        } else {
            await ctx.reply(message, {
                parse_mode: 'HTML',
                reply_markup: replyMarkup
            });
        }

    } catch (error) {
        console.error('[availableProjects] Error:', error);
        await ctx.reply('❌ Произошла ошибка при загрузке доступных проектов.');
    }
};

const projectPreview = async (ctx) => {
    try {
        const projectId = parseInt(ctx.params[0]);
        
        // Валидируем ID проекта
        const validation = validateProjectId(projectId);
        if (!validation.isValid) {
            return ctx.reply(`❌ ${validation.error}`);
        }

        const project = await Project.findById(validation.id);
        
        if (!project) {
            return ctx.reply('❌ Проект не найден.');
        }

        // Получаем заказчика
        const customer = await User.findById(project.customer_id);
        if (!customer) {
            return ctx.reply('❌ Информация о заказчике недоступна.');
        }

        // Формируем сообщение с информацией о проекте
        let message = `📋 <b>${project.name}</b>\n\n`;
        message += `📝 <b>Описание:</b>\n${project.description}\n\n`;
        
        if (project.budget) {
            message += `💰 <b>Бюджет:</b> ${project.budget}\n`;
        }
        
        if (project.deadline) {
            message += `⏰ <b>Срок:</b> ${project.deadline}\n`;
        }
        
        // Добавляем требования к менеджеру
        if (project.manager_requirements) {
            message += `\n📋 <b>Требования к менеджеру:</b>\n${project.manager_requirements}\n`;
        } else {
            message += `\n📋 <b>Требования к менеджеру:</b> не указаны\n`;
        }
        
        // Добавляем условия работы
        if (project.work_conditions) {
            message += `\n⚙️ <b>Условия работы:</b>\n${project.work_conditions}\n`;
        } else {
            message += `\n⚙️ <b>Условия работы:</b> не указаны\n`;
        }
        
        // Добавляем дополнительные пожелания
        if (project.additional_notes) {
            message += `\n💡 <b>Дополнительные пожелания:</b>\n${project.additional_notes}\n`;
        } else {
            message += `\n💡 <b>Дополнительные пожелания:</b> нет\n`;
        }
        
        message += `\n👤 <b>Заказчик:</b> @${customer.username || customer.first_name}\n`;
        message += `📅 <b>Создан:</b> ${new Date(project.created_at).toLocaleDateString('ru-RU')}\n`;
        message += `🆔 <b>ID проекта:</b> ${project.id}`;

        // Показываем кнопки для менеджера
        const replyMarkup = {
            inline_keyboard: [
                [
                    { text: '✅ Согласиться', callback_data: `accept_invite_${project.id}` },
                    { text: '❌ Отказаться', callback_data: `decline_invite_${project.id}` }
                ]
            ]
        };

        await ctx.reply(message, {
            parse_mode: 'HTML',
            reply_markup: replyMarkup
        });

    } catch (error) {
        console.error('Error in projectPreview:', error);
        await ctx.reply('❌ Произошла ошибка при загрузке информации о проекте.');
    }
};

// Функции для работы с вакансиями

// Показать детали проекта для исполнителя
const showProjectForExecutor = async (ctx) => {
    try {
        const projectId = parseInt(ctx.params[0]);
        
        // Валидируем ID проекта
        const validation = validateProjectId(projectId);
        if (!validation.isValid) {
            return ctx.reply(`❌ ${validation.error}`);
        }

        const project = await Project.findByIdWithRoles(validation.id);
        if (!project) {
            return ctx.reply('❌ Проект не найден.');
        }

        // Проверяем, что проект доступен для просмотра
        if (project.status !== 'searching_executors') {
            return ctx.reply('❌ Этот проект не ищет исполнителей.');
        }

        // Формируем сообщение с информацией о проекте
        let message = `📋 <b>${project.name}</b>\n\n`;
        message += `📝 <b>Описание:</b>\n${project.description || 'Не указано'}\n\n`;
        
        if (project.budget) {
            message += `💰 <b>Бюджет:</b> ${project.budget}\n`;
        }
        
        if (project.deadline) {
            message += `⏰ <b>Срок:</b> ${project.deadline}\n`;
        }

        // Получаем статусы заявок исполнителя
        const ExecutorApplication = require('../../db/models/ExecutorApplication');
        const executorApplications = await ExecutorApplication.getExecutorApplicationsForProject(projectId, ctx.user.id);
        const applicationStatuses = {};
        
        for (const app of executorApplications) {
            applicationStatuses[app.role_id] = app;
        }

        // Показываем роли и вакансии с статусами заявок
        if (project.roles && project.roles.length > 0) {
            message += `\n👥 <b>Требуемые специалисты:</b>\n`;
            for (const role of project.roles) {
                const availablePositions = role.positions_count - role.filled_positions;
                if (availablePositions > 0) {
                    message += `\n🔹 <b>${role.role_name}</b>\n`;
                    message += `   📊 Позиций: ${role.filled_positions}/${role.positions_count} (доступно: ${availablePositions})\n`;
                    if (role.required_skills) {
                        message += `   🛠 Требуемые навыки: ${role.required_skills}\n`;
                    }
                    if (role.salary_range) {
                        message += `   💰 Зарплата: ${role.salary_range}\n`;
                    }
                    if (role.description) {
                        message += `   📝 Описание: ${role.description}\n`;
                    }
                    
                    // Показываем статус заявки исполнителя
                    const application = applicationStatuses[role.id];
                    if (application) {
                        if (application.status === 'pending') {
                            message += `   ⏳ <b>Ваш статус:</b> На рассмотрении (${new Date(application.created_at).toLocaleDateString('ru-RU')})\n`;
                        } else if (application.status === 'accepted') {
                            message += `   ✅ <b>Ваш статус:</b> Принят (${new Date(application.created_at).toLocaleDateString('ru-RU')})\n`;
                        } else if (application.status === 'declined') {
                            message += `   ❌ <b>Ваш статус:</b> Отклонено (${new Date(application.rejected_at).toLocaleDateString('ru-RU')})\n`;
                        }
                    }
                }
            }
        } else {
            message += `\n👥 <b>Требуемые специалисты:</b> Не указаны\n`;
        }

        // Показываем заказчика
        const customerName = project.customer_username 
            ? `@${project.customer_username}` 
            : project.customer_first_name || 'Неизвестно';
        message += `\n👤 <b>Заказчик:</b> ${customerName}\n`;

        // Показываем контакты менеджера, если разрешено
        if (project.manager_contacts_visible) {
            const managers = await ProjectManager.findByProject(project.id);
            const acceptedManagers = managers.filter(m => m.status === 'accepted');
            if (acceptedManagers.length > 0) {
                for (const manager of acceptedManagers) {
                    const managerUser = await User.findById(manager.manager_id);
                    if (managerUser && managerUser.contacts) {
                        message += `👨‍💼 <b>Контакты менеджера:</b> ${managerUser.contacts}\n`;
                        break; // Показываем только первого менеджера
                    }
                }
            }
        }

        message += `📅 <b>Создан:</b> ${new Date(project.created_at).toLocaleDateString('ru-RU')}\n`;
        message += `🆔 <b>ID проекта:</b> ${project.id}`;

        // Проверяем возможность отклика
        const hasApplied = executorApplications.length > 0;
        const hasAcceptedApplication = executorApplications.some(app => app.status === 'accepted');
        const hasPendingApplication = executorApplications.some(app => app.status === 'pending');
        const hasDeclinedApplication = executorApplications.some(app => app.status === 'declined');
        
        const replyMarkup = {
            inline_keyboard: [
                [
                    { text: '🔄 Обновить', callback_data: `refresh_project_${project.id}` }
                ]
            ]
        };

        // Если есть принятая заявка - показываем это
        if (hasAcceptedApplication) {
            replyMarkup.inline_keyboard.unshift([
                { text: '✅ Вы приняты в проект', callback_data: 'already_accepted' }
            ]);
        }
        // Если есть заявка на рассмотрении - показываем это
        else if (hasPendingApplication) {
            replyMarkup.inline_keyboard.unshift([
                { text: '⏳ Заявка на рассмотрении', callback_data: 'application_pending' }
            ]);
        }
        // Если есть отклоненная заявка - проверяем возможность повторного отклика
        else if (hasDeclinedApplication) {
            const reapplyCheck = await Project.canExecutorReapply(projectId, ctx.user.id);
            
            if (reapplyCheck.canReapply) {
                replyMarkup.inline_keyboard.unshift([
                    { text: '🔄 Повторно откликнуться', callback_data: `apply_to_project_${project.id}` }
                ]);
            } else {
                replyMarkup.inline_keyboard.unshift([
                    { text: '❌ Повторные отклики запрещены', callback_data: 'reapply_disabled' }
                ]);
            }
        }
        // Если нет заявок - показываем кнопку отклика
        else if (!hasApplied) {
            replyMarkup.inline_keyboard.unshift([
                { text: '✅ Откликнуться на проект', callback_data: `apply_to_project_${project.id}` }
            ]);
        }

        if (ctx.callbackQuery) {
            await ctx.editMessageText(message, {
                parse_mode: 'HTML',
                reply_markup: replyMarkup
            });
        } else {
            await ctx.reply(message, {
                parse_mode: 'HTML',
                reply_markup: replyMarkup
            });
        }

    } catch (error) {
        console.error('Error in showProjectForExecutor:', error);
        await ctx.reply('❌ Произошла ошибка при загрузке информации о проекте.');
    }
};

// Обработка отклика исполнителя на проект
const handleExecutorApplication = async (ctx) => {
    try {
        const projectId = parseInt(ctx.match[1]);
        
        if (!ctx.user) {
            await ctx.answerCbQuery('❌ Пользователь не найден');
            return;
        }

        const project = await Project.findById(projectId);
        if (!project) {
            await ctx.answerCbQuery('❌ Проект не найден');
            return;
        }

        // Получаем доступные роли
        const availableRoles = await ProjectRole.findByProjectId(projectId);
        const rolesWithPositions = availableRoles.filter(role => 
            role.positions_count > role.filled_positions
        );
        
        if (rolesWithPositions.length === 0) {
            await ctx.answerCbQuery('❌ Нет доступных вакансий');
            return;
        }

        // Сохраняем информацию о заявке в сессии
        ctx.session = ctx.session || {};
        ctx.session.pendingApplication = {
            projectId: projectId,
            projectName: project.name,
            availableRoles: rolesWithPositions
        };

        // Показываем доступные роли для выбора
        let message = `📋 <b>Выберите роль для отклика:</b>\n\n`;
        message += `Проект: <b>${project.name}</b>\n\n`;
        
        const roleButtons = [];
        for (const role of rolesWithPositions) {
            const availablePositions = role.positions_count - role.filled_positions;
            message += `🔹 <b>${role.role_name}</b>\n`;
            message += `   📊 Позиций: ${role.filled_positions}/${role.positions_count} (доступно: ${availablePositions})\n`;
            if (role.required_skills) {
                message += `   🛠 Требуемые навыки: ${role.required_skills}\n`;
            }
            if (role.salary_range) {
                message += `   💰 Зарплата: ${role.salary_range}\n`;
            }
            message += '\n';
            
            roleButtons.push([
                { 
                    text: `✅ ${role.role_name}`, 
                    callback_data: `apply_role_${role.id}_${projectId}` 
                }
            ]);
        }

        roleButtons.push([
            { text: '❌ Отменить', callback_data: 'cancel_application' }
        ]);

        await ctx.editMessageText(message, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: roleButtons
            }
        });

        await ctx.answerCbQuery();

    } catch (error) {
        console.error('Error in handleExecutorApplication:', error);
        await ctx.answerCbQuery('❌ Произошла ошибка при обработке заявки');
    }
};

// Обработка выбора роли для отклика
const handleExecutorRoleSelection = async (ctx) => {
    try {
        const [roleId, projectId] = ctx.match.slice(1).map(Number);
        
        if (!ctx.session?.pendingApplication) {
            await ctx.answerCbQuery('❌ Сессия заявки не найдена');
            return;
        }

        // Проверяем, может ли исполнитель откликнуться на эту роль
        const ExecutorApplication = require('../../db/models/ExecutorApplication');
        const canApply = await ExecutorApplication.canApply(projectId, roleId, ctx.user.id);
        if (!canApply) {
            await ctx.answerCbQuery('❌ Вы уже откликались на эту роль');
            return;
        }

        // Создаем отклик
        const application = await ExecutorApplication.create({
            project_id: projectId,
            role_id: roleId,
            executor_id: ctx.user.id
        });

        // Уведомляем менеджеров проекта
        const managers = await ProjectManager.findByProject(projectId);
        const acceptedManagers = managers.filter(m => m.status === 'accepted');
        
        for (const manager of acceptedManagers) {
            const managerUser = await User.findById(manager.manager_id);
            if (managerUser) {
                const role = ctx.session.pendingApplication.availableRoles.find(r => r.id === roleId);
                const roleName = role ? role.role_name : 'Неизвестная роль';
                
                await ctx.telegram.sendMessage(
                    managerUser.telegram_id,
                    `🎉 <b>Новый отклик на проект!</b>\n\n` +
                    `Проект: <b>${ctx.session.pendingApplication.projectName}</b>\n` +
                    `Роль: <b>${roleName}</b>\n` +
                    `Исполнитель: @${ctx.user.username || ctx.user.first_name}\n` +
                    `Специализация: ${ctx.user.specialization || 'Не указана'}\n\n` +
                    `Для просмотра всех откликов нажмите кнопку ниже:`,
                    { 
                        parse_mode: 'HTML',
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    { text: '👥 Просмотр откликов', callback_data: `view_applications_${projectId}` }
                                ]
                            ]
                        }
                    }
                );
            }
        }

        // Логируем событие
        await AuditLog.create(
            ctx.user.id,
            'EXECUTOR_APPLIED',
            projectId,
            { 
                executorUsername: ctx.user.username, 
                projectName: ctx.session.pendingApplication.projectName,
                roleId: roleId,
                applicationId: application.id
            }
        );

        // Сохраняем название проекта перед очисткой сессии
        const projectName = ctx.session.pendingApplication.projectName;
        
        // Очищаем сессию
        delete ctx.session.pendingApplication;

        await ctx.editMessageText(
            `✅ <b>Отклик отправлен!</b>\n\n` +
            `Проект: <b>${projectName}</b>\n` +
            `Менеджер проекта получит уведомление о вашем отклике.\n\n` +
            `Вы можете отслеживать статус в разделе "Мои проекты".`,
            { parse_mode: 'HTML' }
        );

        await ctx.answerCbQuery('✅ Отклик успешно отправлен!');

    } catch (error) {
        console.error('Error in handleExecutorRoleSelection:', error);
        await ctx.answerCbQuery('❌ Произошла ошибка при отправке отклика');
    }
};

// Функции для менеджеров по управлению вакансиями

// Начать добавление вакансий к проекту
const startAddVacancies = async (ctx) => {
    try {
        const projectId = parseInt(ctx.match[1]);
        
        const project = await Project.findById(projectId);
        if (!project) {
            await ctx.answerCbQuery('❌ Проект не найден');
            return;
        }

        // Проверяем права доступа (только менеджер проекта)
        const managers = await ProjectManager.findByProject(projectId);
        const isManager = managers.some(m => m.manager_id === ctx.user.id && m.status === 'accepted');
        
        if (!isManager && project.customer_id !== ctx.user.id) {
            await ctx.answerCbQuery('❌ У вас нет прав для управления вакансиями');
            return;
        }

        // Начинаем процесс добавления вакансий
        ctx.session = ctx.session || {};
        ctx.session.addingVacancies = {
            projectId: projectId,
            projectName: project.name,
            currentRole: null,
            roles: []
        };

        await ctx.reply(
            `📝 <b>Добавление вакансий к проекту</b>\n\n` +
            `Проект: <b>${project.name}</b>\n\n` +
            `Введите название роли (например: "Frontend-разработчик", "UI/UX дизайнер"):`,
            { 
                parse_mode: 'HTML',
                reply_markup: {
                    keyboard: [['❌ Завершить добавление']],
                    resize_keyboard: true,
                    one_time_keyboard: true
                }
            }
        );

        await ctx.answerCbQuery();

    } catch (error) {
        console.error('Error in startAddVacancies:', error);
        await ctx.answerCbQuery('❌ Произошла ошибка');
    }
};

// Просмотр откликов на проект
const viewApplications = async (ctx) => {
    try {
        const projectId = parseInt(ctx.match[1]);
        
        const project = await Project.findById(projectId);
        if (!project) {
            await ctx.answerCbQuery('❌ Проект не найден');
            return;
        }

        // Проверяем права доступа (только менеджер проекта)
        const managers = await ProjectManager.findByProject(projectId);
        const isManager = managers.some(m => m.manager_id === ctx.user.id && m.status === 'accepted');
        
        if (!isManager && project.customer_id !== ctx.user.id) {
            await ctx.answerCbQuery('❌ У вас нет прав для просмотра откликов');
            return;
        }

        // Получаем отклики
        const ExecutorApplication = require('../../db/models/ExecutorApplication');
        const applications = await ExecutorApplication.findByProject(projectId);
        
        if (applications.length === 0) {
            await ctx.editMessageText(
                `📋 <b>Отклики на проект "${project.name}"</b>\n\n` +
                `❌ Пока нет откликов на этот проект.`,
                { 
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '🔙 Назад к проекту', callback_data: `project_details_${projectId}` }
                            ]
                        ]
                    }
                }
            );
            return;
        }

        // Разделяем отклики на добровольные (pending) и приглашения (invited)
        const voluntaryApps = applications.filter(app => app.status === 'pending');
        const invitedApps = applications.filter(app => app.status === 'invited');
        const acceptedApps = applications.filter(app => app.status === 'accepted');
        const declinedApps = applications.filter(app => app.status === 'declined');
        


        let message = `📋 <b>Отклики на проект "${project.name}"</b>\n\n`;
        
        // Показываем статистику
        message += `📊 <b>Статистика:</b>\n`;
        message += `⏳ Добровольные отклики: ${voluntaryApps.length}\n`;
        message += `📤 Направленные приглашения: ${invitedApps.length}\n`;
        message += `✅ Приняты: ${acceptedApps.length}\n`;
        message += `❌ Отклонены: ${declinedApps.length}\n\n`;

        // Показываем добровольные отклики
        if (voluntaryApps.length > 0) {
            message += `⏳ <b>Добровольные отклики:</b>\n`;
            for (const app of voluntaryApps) {
                const executorName = app.username ? `@${app.username}` : `${app.first_name} ${app.last_name || ''}`;
                message += `\n👤 <b>${executorName}</b>\n`;
                message += `   🎯 Роль: ${app.role_name}\n`;
                message += `   🛠 Специализация: ${app.specialization || 'Не указана'}\n`;
                if (app.skills) {
                    let skills = app.skills;
                    if (Array.isArray(skills)) {
                        skills = skills.join(', ');
                    }
                    message += `   💡 Навыки: ${skills}\n`;
                }
                if (app.contacts) {
                    message += `   📞 Контакты: ${app.contacts}\n`;
                }
                message += `   📅 Откликнулся: ${new Date(app.created_at).toLocaleDateString('ru-RU')}\n`;
            }
        }

        // Формируем кнопки
        const buttons = [];
        
        // Кнопки для управления откликами
        if (voluntaryApps.length > 0) {
            buttons.push([
                { text: '✅ Принять исполнителей', callback_data: `accept_applications_${projectId}` }
            ]);
            buttons.push([
                { text: '❌ Отклонить исполнителей', callback_data: `decline_applications_${projectId}` }
            ]);
        }
        
        // Кнопка для просмотра направленных приглашений
        if (invitedApps.length > 0) {
            buttons.push([
                { text: '📤 Направленные приглашения', callback_data: `view_invitations_${projectId}` }
            ]);
        }
        
        // Кнопка для просмотра принятых приглашений (которые можно добавить в проект)
        if (acceptedApps.length > 0) {
            buttons.push([
                { text: '✅ Добавить в проект', callback_data: `add_accepted_to_project_${projectId}` }
            ]);
        }
        
        buttons.push([
            { text: '🔙 Назад к проекту', callback_data: `project_details_${projectId}` }
        ]);

        await ctx.editMessageText(message, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: buttons
            }
        });

        await ctx.answerCbQuery();

    } catch (error) {
        console.error('Error in viewApplications:', error);
        await ctx.answerCbQuery('❌ Произошла ошибка при загрузке откликов');
    }
};

// Принятие отклика
const acceptApplication = async (ctx) => {
    try {
        const projectId = parseInt(ctx.match[1]);
        
        const project = await Project.findById(projectId);
        if (!project) {
            await ctx.answerCbQuery('❌ Проект не найден');
            return;
        }

        // Проверяем права доступа
        const managers = await ProjectManager.findByProject(projectId);
        const isManager = managers.some(m => m.manager_id === ctx.user.id && m.status === 'accepted');
        
        if (!isManager && project.customer_id !== ctx.user.id) {
            await ctx.answerCbQuery('❌ У вас нет прав для принятия откликов');
            return;
        }

        // Получаем ожидающие отклики
        const ExecutorApplication = require('../../db/models/ExecutorApplication');
        const pendingApps = await ExecutorApplication.findByProject(projectId);
        const waitingApps = pendingApps.filter(app => app.status === 'pending');
        
        if (waitingApps.length === 0) {
            await ctx.answerCbQuery('❌ Нет ожидающих откликов');
            return;
        }

        // Показываем список откликов для выбора
        let message = `✅ <b>Выберите отклик для принятия:</b>\n\n`;
        message += `Проект: <b>${project.name}</b>\n\n`;
        
        const buttons = [];
        for (const app of waitingApps) {
            const executorName = app.username ? `@${app.username}` : `${app.first_name} ${app.last_name || ''}`;
            message += `👤 <b>${executorName}</b>\n`;
            message += `   🎯 Роль: ${app.role_name}\n`;
            message += `   🛠 Специализация: ${app.specialization || 'Не указана'}\n`;
            message += `   📅 Откликнулся: ${new Date(app.created_at).toLocaleDateString('ru-RU')}\n\n`;
            
            buttons.push([
                { 
                    text: `✅ Принять ${executorName}`, 
                    callback_data: `confirm_accept_${app.id}` 
                }
            ]);
        }

        buttons.push([
            { text: '🔙 Назад', callback_data: `view_applications_${projectId}` }
        ]);

        await ctx.editMessageText(message, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: buttons
            }
        });

        await ctx.answerCbQuery();

    } catch (error) {
        console.error('Error in acceptApplication:', error);
        await ctx.answerCbQuery('❌ Произошла ошибка');
    }
};

// Подтверждение принятия отклика
const confirmAcceptApplication = async (ctx) => {
    try {
        const applicationId = parseInt(ctx.match[1]);
        
        const ExecutorApplication = require('../../db/models/ExecutorApplication');
        const application = await ExecutorApplication.findById(applicationId);
        
        if (!application) {
            await ctx.answerCbQuery('❌ Отклик не найден');
            return;
        }

        if (application.status !== 'pending') {
            await ctx.answerCbQuery('❌ Отклик уже обработан');
            return;
        }

        // Принимаем отклик
        const acceptedApp = await ExecutorApplication.accept(applicationId);
        
        // Уведомляем исполнителя
        const executorUser = await User.findById(application.executor_id);
        if (executorUser) {
            await ctx.telegram.sendMessage(
                executorUser.telegram_id,
                `🎉 <b>Ваш отклик принят!</b>\n\n` +
                `Проект: <b>${application.project_name}</b>\n` +
                `Роль: <b>${application.role_name}</b>\n\n` +
                `Поздравляем! Вы были приняты в команду проекта.\n` +
                `Менеджер проекта свяжется с вами для дальнейших инструкций.`,
                { parse_mode: 'HTML' }
            );
        }

        // Логируем событие
        await AuditLog.create(
            ctx.user.id,
            'APPLICATION_ACCEPTED',
            application.project_id,
            { 
                executorId: application.executor_id,
                executorUsername: executorUser?.username,
                roleName: application.role_name,
                applicationId: applicationId
            }
        );

        await ctx.editMessageText(
            `✅ <b>Отклик принят!</b>\n\n` +
            `Исполнитель: <b>${executorUser?.username ? '@' + executorUser.username : executorUser?.first_name || 'Неизвестно'}</b>\n` +
            `Роль: <b>${application.role_name}</b>\n` +
            `Проект: <b>${application.project_name}</b>\n\n` +
            `Исполнитель получил уведомление о принятии.`,
            { 
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '👥 Просмотр откликов', callback_data: `view_applications_${application.project_id}` }
                        ],
                        [
                            { text: '🔙 К проекту', callback_data: `project_details_${application.project_id}` }
                        ]
                    ]
                }
            }
        );

        await ctx.answerCbQuery('✅ Отклик успешно принят!');

    } catch (error) {
        console.error('Error in confirmAcceptApplication:', error);
        await ctx.answerCbQuery('❌ Произошла ошибка при принятии отклика');
    }
};

// Отклонение отклика
const declineApplication = async (ctx) => {
    try {
        const projectId = parseInt(ctx.match[1]);
        
        const project = await Project.findById(projectId);
        if (!project) {
            await ctx.answerCbQuery('❌ Проект не найден');
            return;
        }

        // Проверяем права доступа
        const managers = await ProjectManager.findByProject(projectId);
        const isManager = managers.some(m => m.manager_id === ctx.user.id && m.status === 'accepted');
        
        if (!isManager && project.customer_id !== ctx.user.id) {
            await ctx.answerCbQuery('❌ У вас нет прав для отклонения откликов');
            return;
        }

        // Получаем ожидающие отклики
        const ExecutorApplication = require('../../db/models/ExecutorApplication');
        const pendingApps = await ExecutorApplication.findByProject(projectId);
        const waitingApps = pendingApps.filter(app => app.status === 'pending');
        
        if (waitingApps.length === 0) {
            await ctx.answerCbQuery('❌ Нет ожидающих откликов');
            return;
        }

        // Показываем список откликов для выбора
        let message = `❌ <b>Выберите отклик для отклонения:</b>\n\n`;
        message += `Проект: <b>${project.name}</b>\n\n`;
        
        const buttons = [];
        for (const app of waitingApps) {
            const executorName = app.username ? `@${app.username}` : `${app.first_name} ${app.last_name || ''}`;
            message += `👤 <b>${executorName}</b>\n`;
            message += `   🎯 Роль: ${app.role_name}\n`;
            message += `   🛠 Специализация: ${app.specialization || 'Не указана'}\n`;
            message += `   📅 Откликнулся: ${new Date(app.created_at).toLocaleDateString('ru-RU')}\n\n`;
            
            buttons.push([
                { 
                    text: `❌ Отклонить ${executorName}`, 
                    callback_data: `confirm_decline_${app.id}` 
                }
            ]);
        }

        buttons.push([
            { text: '🔙 Назад', callback_data: `view_applications_${projectId}` }
        ]);

        await ctx.editMessageText(message, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: buttons
            }
        });

        await ctx.answerCbQuery();

    } catch (error) {
        console.error('Error in declineApplication:', error);
        await ctx.answerCbQuery('❌ Произошла ошибка');
    }
};

// Подтверждение отклонения отклика
const confirmDeclineApplication = async (ctx) => {
    try {
        const applicationId = parseInt(ctx.match[1]);
        
        const ExecutorApplication = require('../../db/models/ExecutorApplication');
        const application = await ExecutorApplication.findById(applicationId);
        
        if (!application) {
            await ctx.answerCbQuery('❌ Отклик не найден');
            return;
        }

        if (application.status !== 'pending') {
            await ctx.answerCbQuery('❌ Отклик уже обработан');
            return;
        }

        // Отклоняем отклик
        await ExecutorApplication.decline(applicationId);
        
        // Уведомляем исполнителя
        const executorUser = await User.findById(application.executor_id);
        if (executorUser) {
            await ctx.telegram.sendMessage(
                executorUser.telegram_id,
                `❌ <b>Ваш отклик отклонен</b>\n\n` +
                `Проект: <b>${application.project_name}</b>\n` +
                `Роль: <b>${application.role_name}</b>\n\n` +
                `К сожалению, ваш отклик на этот проект был отклонен.\n` +
                `Не расстраивайтесь, продолжайте искать другие интересные проекты!`,
                { parse_mode: 'HTML' }
            );
        }

        // Логируем событие
        await AuditLog.create(
            ctx.user.id,
            'APPLICATION_DECLINED',
            application.project_id,
            { 
                executorId: application.executor_id,
                executorUsername: executorUser?.username,
                roleName: application.role_name,
                applicationId: applicationId
            }
        );

        await ctx.editMessageText(
            `❌ <b>Отклик отклонен</b>\n\n` +
            `Исполнитель: <b>${executorUser?.username ? '@' + executorUser.username : executorUser?.first_name || 'Неизвестно'}</b>\n` +
            `Роль: <b>${application.role_name}</b>\n` +
            `Проект: <b>${application.project_name}</b>\n\n` +
            `Исполнитель получил уведомление об отклонении.`,
            { 
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '👥 Просмотр откликов', callback_data: `view_applications_${application.project_id}` }
                        ],
                        [
                            { text: '🔙 К проекту', callback_data: `project_details_${application.project_id}` }
                        ]
                    ]
                }
            }
        );

        await ctx.answerCbQuery('❌ Отклик отклонен');

    } catch (error) {
        console.error('Error in confirmDeclineApplication:', error);
        await ctx.answerCbQuery('❌ Произошла ошибка при отклонении отклика');
    }
};

// Просмотр вакансий проекта
const viewVacancies = async (ctx) => {
    try {
        const projectId = parseInt(ctx.match[1]);
        
        const project = await Project.findById(projectId);
        if (!project) {
            await ctx.answerCbQuery('❌ Проект не найден');
            return;
        }

        // Проверяем права доступа
        const managers = await ProjectManager.findByProject(projectId);
        const isManager = managers.some(m => m.manager_id === ctx.user.id && m.status === 'accepted');
        
        if (!isManager && project.customer_id !== ctx.user.id) {
            await ctx.answerCbQuery('❌ У вас нет прав для просмотра вакансий');
            return;
        }

        // Получаем вакансии
        const roles = await ProjectRole.findByProjectId(projectId);
        
        if (roles.length === 0) {
            await ctx.editMessageText(
                `📋 <b>Вакансии проекта "${project.name}"</b>\n\n` +
                `❌ Вакансии не созданы.\n\n` +
                `Нажмите "➕ Добавить вакансию" для создания первой вакансии.`,
                { 
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '➕ Добавить вакансию', callback_data: `add_vacancies_${projectId}` }
                            ],
                            [
                                { text: '🔙 Назад к проекту', callback_data: `project_details_${projectId}` }
                            ]
                        ]
                    }
                }
            );
            return;
        }

        let message = `📋 <b>Вакансии проекта "${project.name}"</b>\n\n`;
        
        for (const role of roles) {
            const availablePositions = role.positions_count - role.filled_positions;
            message += `🔹 <b>${role.role_name}</b>\n`;
            message += `   📊 Позиций: ${role.filled_positions}/${role.positions_count} (доступно: ${availablePositions})\n`;
            if (role.required_skills) {
                message += `   🛠 Навыки: ${role.required_skills}\n`;
            }
            if (role.salary_range) {
                message += `   💰 Зарплата: ${role.salary_range}\n`;
            }
            if (role.description) {
                message += `   📝 Описание: ${role.description}\n`;
            }
            message += `   🆔 ID: ${role.id}\n\n`;
        }

        const replyMarkup = {
            inline_keyboard: [
                [
                    { text: '➕ Добавить вакансию', callback_data: `add_vacancies_${projectId}` }
                ],
                [
                    { text: '✏️ Редактировать', callback_data: `edit_vacancies_${projectId}` }
                ],
                [
                    { text: '🔙 Назад к проекту', callback_data: `project_details_${projectId}` }
                ]
            ]
        };

        await ctx.editMessageText(message, {
            parse_mode: 'HTML',
            reply_markup: replyMarkup
        });

        await ctx.answerCbQuery();

    } catch (error) {
        console.error('Error in viewVacancies:', error);
        await ctx.answerCbQuery('❌ Произошла ошибка при загрузке вакансий');
    }
};

// Редактирование вакансий
const editVacancies = async (ctx) => {
    try {
        const projectId = parseInt(ctx.match[1]);
        
        const project = await Project.findById(projectId);
        if (!project) {
            await ctx.answerCbQuery('❌ Проект не найден');
            return;
        }

        // Проверяем права доступа
        const managers = await ProjectManager.findByProject(projectId);
        const isManager = managers.some(m => m.manager_id === ctx.user.id && m.status === 'accepted');
        
        if (!isManager && project.customer_id !== ctx.user.id) {
            await ctx.answerCbQuery('❌ У вас нет прав для редактирования вакансий');
            return;
        }

        // Получаем вакансии
        const roles = await ProjectRole.findByProjectId(projectId);
        
        if (roles.length === 0) {
            await ctx.editMessageText(
                `✏️ <b>Редактирование вакансий</b>\n\n` +
                `❌ Вакансии не созданы.\n\n` +
                `Сначала создайте вакансии.`,
                { 
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '➕ Добавить вакансию', callback_data: `add_vacancies_${projectId}` }
                            ],
                            [
                                { text: '🔙 Назад', callback_data: `view_vacancies_${projectId}` }
                            ]
                        ]
                    }
                }
            );
            return;
        }

        let message = `✏️ <b>Редактирование вакансий проекта "${project.name}"</b>\n\n`;
        message += `Выберите вакансию для редактирования:\n\n`;
        
        const roleButtons = [];
        for (const role of roles) {
            roleButtons.push([
                { 
                    text: `✏️ ${role.role_name} (${role.filled_positions}/${role.positions_count})`, 
                    callback_data: `edit_role_${role.id}` 
                }
            ]);
        }

        roleButtons.push([
            { text: '➕ Добавить вакансию', callback_data: `add_vacancies_${projectId}` }
        ]);
        roleButtons.push([
            { text: '🔙 Назад', callback_data: `view_vacancies_${projectId}` }
        ]);

        await ctx.editMessageText(message, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: roleButtons
            }
        });

        await ctx.answerCbQuery();

    } catch (error) {
        console.error('Error in editVacancies:', error);
        await ctx.answerCbQuery('❌ Произошла ошибка при загрузке вакансий');
    }
};

// Обработка шагов добавления вакансий
const handleVacancyStep = async (ctx) => {
    try {
        if (!ctx.session?.addingVacancies) {
            return false;
        }

        const text = ctx.message.text;

        if (text === '❌ Завершить добавление') {
            // Сохраняем все роли в базу данных
            const { projectId, roles } = ctx.session.addingVacancies;
            
            for (const roleData of roles) {
                await ProjectRole.create(projectId, roleData);
            }

            // Проверяем заполненность профиля для правильной клавиатуры
            let isProfileComplete = false;
            if (ctx.user.main_role === 'executor') {
                isProfileComplete = await User.isExecutorProfileFullyComplete(ctx.user.telegram_id);
            } else if (ctx.user.main_role === 'manager') {
                isProfileComplete = await User.isManagerProfileFullyComplete(ctx.user.telegram_id);
            }

            await ctx.reply(
                `✅ <b>Вакансии добавлены!</b>\n\n` +
                `К проекту добавлено ${roles.length} вакансий.\n` +
                `Теперь исполнители смогут откликаться на проект.`,
                { 
                    parse_mode: 'HTML',
                    reply_markup: getKeyboardByRole(ctx.user.main_role, isProfileComplete).reply_markup
                }
            );

            delete ctx.session.addingVacancies;
            return true;
        }

        const { currentRole } = ctx.session.addingVacancies;

        if (!currentRole) {
            // Начинаем новую роль
            ctx.session.addingVacancies.currentRole = {
                role_name: text,
                step: 'skills'
            };

            await ctx.reply(
                `🔹 <b>Роль:</b> ${text}\n\n` +
                `Введите требуемые навыки (или "пропустить"):`,
                { parse_mode: 'HTML' }
            );
        } else if (currentRole.step === 'skills') {
            if (text.toLowerCase() !== 'пропустить') {
                currentRole.required_skills = text;
            }
            currentRole.step = 'positions';

            await ctx.reply(
                `🔹 <b>Роль:</b> ${currentRole.role_name}\n` +
                `🔹 <b>Навыки:</b> ${currentRole.required_skills || 'Не указаны'}\n\n` +
                `Введите количество открытых позиций (число):`,
                { parse_mode: 'HTML' }
            );
        } else if (currentRole.step === 'positions') {
            const positionsCount = parseInt(text);
            if (isNaN(positionsCount) || positionsCount < 1) {
                await ctx.reply('❌ Введите корректное число позиций (минимум 1):');
                return true;
            }

            currentRole.positions_count = positionsCount;
            currentRole.step = 'salary';

            await ctx.reply(
                `🔹 <b>Роль:</b> ${currentRole.role_name}\n` +
                `🔹 <b>Навыки:</b> ${currentRole.required_skills || 'Не указаны'}\n` +
                `🔹 <b>Позиций:</b> ${currentRole.positions_count}\n\n` +
                `Введите зарплатный диапазон (или "пропустить"):`,
                { parse_mode: 'HTML' }
            );
        } else if (currentRole.step === 'salary') {
            if (text.toLowerCase() !== 'пропустить') {
                currentRole.salary_range = text;
            }
            currentRole.step = 'description';

            await ctx.reply(
                `🔹 <b>Роль:</b> ${currentRole.role_name}\n` +
                `🔹 <b>Навыки:</b> ${currentRole.required_skills || 'Не указаны'}\n` +
                `🔹 <b>Позиций:</b> ${currentRole.positions_count}\n` +
                `🔹 <b>Зарплата:</b> ${currentRole.salary_range || 'Не указана'}\n\n` +
                `Введите описание роли (или "пропустить"):`,
                { parse_mode: 'HTML' }
            );
        } else if (currentRole.step === 'description') {
            if (text.toLowerCase() !== 'пропустить') {
                currentRole.description = text;
            }

            // Сохраняем роль в список
            ctx.session.addingVacancies.roles.push({ ...currentRole });
            
            await ctx.reply(
                `✅ <b>Роль добавлена!</b>\n\n` +
                `🔹 <b>Роль:</b> ${currentRole.role_name}\n` +
                `🔹 <b>Навыки:</b> ${currentRole.required_skills || 'Не указаны'}\n` +
                `🔹 <b>Позиций:</b> ${currentRole.positions_count}\n` +
                `🔹 <b>Зарплата:</b> ${currentRole.salary_range || 'Не указана'}\n` +
                `🔹 <b>Описание:</b> ${currentRole.description || 'Не указано'}\n\n` +
                `Введите название следующей роли или нажмите "❌ Завершить добавление":`,
                { parse_mode: 'HTML' }
            );

            // Сбрасываем текущую роль для следующей
            ctx.session.addingVacancies.currentRole = null;
        }

        return true;

    } catch (error) {
        console.error('Error in handleVacancyStep:', error);
        await ctx.reply('❌ Произошла ошибка при добавлении вакансии.');
        return true;
    }
};

// Обработка нажатия на кнопку "Вы приняты в проект"
const handleAlreadyAccepted = async (ctx) => {
    await ctx.answerCbQuery('✅ Вы уже приняты в этот проект!');
};

// Обработка нажатия на кнопку "Заявка на рассмотрении"
const handleApplicationPending = async (ctx) => {
    await ctx.answerCbQuery('⏳ Ваша заявка находится на рассмотрении. Ожидайте решения менеджера.');
};

// Обработка нажатия на кнопку "Повторные отклики запрещены"
const handleReapplyDisabled = async (ctx) => {
    await ctx.answerCbQuery('❌ Повторные отклики запрещены настройками проекта.');
};

// Обработка настроек повторных откликов
const handleReapplySettings = async (ctx) => {
    try {
        const projectId = parseInt(ctx.match[1]);
        
        const project = await Project.findById(projectId);
        if (!project) {
            await ctx.answerCbQuery('❌ Проект не найден');
            return;
        }

        // Проверяем права доступа (только менеджер проекта)
        const managers = await ProjectManager.findByProject(projectId);
        const isManager = managers.some(m => m.manager_id === ctx.user.id && m.status === 'accepted');
        
        if (!isManager && project.customer_id !== ctx.user.id) {
            await ctx.answerCbQuery('❌ У вас нет прав для управления настройками проекта');
            return;
        }

        // Получаем текущие настройки
        const allowReapply = await Project.getReapplySettings(projectId);
        
        const message = `⚙️ <b>Настройки повторных откликов</b>\n\n` +
            `Проект: <b>${project.name}</b>\n\n` +
            `Текущая настройка: ${allowReapply ? '✅ Разрешены' : '❌ Запрещены'}\n\n` +
            `Выберите новую настройку:`;
        
        const buttons = [
            [
                { 
                    text: allowReapply ? '✅ Разрешены' : '✅ Разрешить повторные отклики', 
                    callback_data: `set_reapply_${projectId}_true` 
                }
            ],
            [
                { 
                    text: !allowReapply ? '❌ Запрещены' : '❌ Запретить повторные отклики', 
                    callback_data: `set_reapply_${projectId}_false` 
                }
            ],
            [
                { text: '🔙 Назад к проекту', callback_data: `project_details_${projectId}` }
            ]
        ];

        await ctx.editMessageText(message, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: buttons
            }
        });

        await ctx.answerCbQuery();

    } catch (error) {
        console.error('Error in handleReapplySettings:', error);
        await ctx.answerCbQuery('❌ Произошла ошибка при загрузке настроек');
    }
};

// Обработка изменения настроек повторных откликов
const handleSetReapply = async (ctx) => {
    try {
        const projectId = parseInt(ctx.match[1]);
        const allowReapply = ctx.match[2] === 'true';
        
        const project = await Project.findById(projectId);
        if (!project) {
            await ctx.answerCbQuery('❌ Проект не найден');
            return;
        }

        // Проверяем права доступа
        const managers = await ProjectManager.findByProject(projectId);
        const isManager = managers.some(m => m.manager_id === ctx.user.id && m.status === 'accepted');
        
        if (!isManager && project.customer_id !== ctx.user.id) {
            await ctx.answerCbQuery('❌ У вас нет прав для изменения настроек проекта');
            return;
        }

        // Обновляем настройки
        await Project.updateReapplySettings(projectId, allowReapply);
        
        const settingText = allowReapply ? 'разрешены' : 'запрещены';
        
        await ctx.editMessageText(
            `✅ <b>Настройки обновлены!</b>\n\n` +
            `Повторные отклики теперь ${settingText} для проекта "${project.name}".`,
            { 
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '🔙 Назад к проекту', callback_data: `project_details_${projectId}` }
                        ]
                    ]
                }
            }
        );

        await ctx.answerCbQuery(`✅ Повторные отклики ${settingText}`);

    } catch (error) {
        console.error('Error in handleSetReapply:', error);
        await ctx.answerCbQuery('❌ Произошла ошибка при обновлении настроек');
    }
};

// Обработка нажатия на кнопку "Обновить проект"
const handleRefreshProject = async (ctx) => {
    const projectId = parseInt(ctx.match[1]);
    ctx.params = [projectId.toString()];
    await showProjectForExecutor(ctx);
    await ctx.answerCbQuery('🔄 Проект обновлен');
};

// Показать меню редактирования вакансии
const showRoleEditMenu = async (ctx) => {
    try {
        const roleId = parseInt(ctx.match[1]);
        
        const role = await ProjectRole.findById(roleId);
        if (!role) {
            await ctx.answerCbQuery('❌ Вакансия не найдена');
            return;
        }

        // Проверяем права доступа
        const project = await Project.findById(role.project_id);
        const managers = await ProjectManager.findByProject(role.project_id);
        const isManager = managers.some(m => m.manager_id === ctx.user.id && m.status === 'accepted');
        
        if (!isManager && project.customer_id !== ctx.user.id) {
            await ctx.answerCbQuery('❌ У вас нет прав для редактирования этой вакансии');
            return;
        }

        let message = `✏️ <b>Редактирование вакансии</b>\n\n`;
        message += `🔹 <b>Роль:</b> ${role.role_name}\n`;
        message += `🔹 <b>Навыки:</b> ${role.required_skills || 'Не указаны'}\n`;
        message += `🔹 <b>Позиций:</b> ${role.filled_positions}/${role.positions_count}\n`;
        message += `🔹 <b>Зарплата:</b> ${role.salary_range || 'Не указана'}\n`;
        message += `🔹 <b>Описание:</b> ${role.description || 'Не указано'}\n\n`;
        message += `Выберите поле для редактирования:`;

        const buttons = [
            [
                { text: '📝 Название роли', callback_data: `edit_role_name_${roleId}` },
                { text: '🛠 Навыки', callback_data: `edit_role_required_skills_${roleId}` }
            ],
            [
                { text: '👥 Количество позиций', callback_data: `edit_role_positions_${roleId}` },
                { text: '💰 Зарплата', callback_data: `edit_role_salary_${roleId}` }
            ],
            [
                { text: '📄 Описание', callback_data: `edit_role_description_${roleId}` }
            ],
            [
                { text: '🗑 Удалить вакансию', callback_data: `delete_role_${roleId}` }
            ],
            [
                { text: '🔙 Назад к вакансиям', callback_data: `edit_vacancies_${role.project_id}` }
            ]
        ];

        await ctx.editMessageText(message, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: buttons
            }
        });

        await ctx.answerCbQuery();

    } catch (error) {
        console.error('Error in showRoleEditMenu:', error);
        await ctx.answerCbQuery('❌ Произошла ошибка при загрузке вакансии');
    }
};

// Начать редактирование конкретного поля вакансии
const startEditRole = async (ctx) => {
    try {
        const data = ctx.callbackQuery.data;
        const parts = data.split('_');
        
        let field, roleId;
        
        // Обрабатываем два формата: edit_role_required_skills_123 и edit_role_name_123
        if (parts[2] === 'required' && parts[3] === 'skills') {
            field = 'required_skills';
            roleId = parseInt(parts[4]);
        } else {
            field = parts[2]; // name, positions, salary, description
            roleId = parseInt(parts[3]);
            
            // Преобразуем name в role_name для соответствия с базой данных
            if (field === 'name') {
                field = 'role_name';
            }
            
            // Преобразуем positions в positions_count для соответствия с базой данных
            if (field === 'positions') {
                field = 'positions_count';
            }
            
            // Преобразуем salary в salary_range для соответствия с базой данных
            if (field === 'salary') {
                field = 'salary_range';
            }
        }
        
        const role = await ProjectRole.findById(roleId);
        if (!role) {
            await ctx.answerCbQuery('❌ Вакансия не найдена');
            return;
        }

        // Проверяем права доступа
        const project = await Project.findById(role.project_id);
        const managers = await ProjectManager.findByProject(role.project_id);
        const isManager = managers.some(m => m.manager_id === ctx.user.id && m.status === 'accepted');
        
        if (!isManager && project.customer_id !== ctx.user.id) {
            await ctx.answerCbQuery('❌ У вас нет прав для редактирования этой вакансии');
            return;
        }

        // Инициализируем сессию редактирования
        ctx.session = ctx.session || {};
        ctx.session.editingRole = {
            roleId: roleId,
            field: field,
            currentValue: role[field] || ''
        };

        let prompt = '';
        let currentValue = role[field] || '';
        
        switch (field) {
            case 'role_name':
                prompt = 'Введите новое название роли:';
                break;
            case 'required_skills':
                prompt = 'Введите требуемые навыки (или "пропустить"):';
                break;
            case 'positions_count':
                prompt = `Введите количество позиций (текущее: ${currentValue}):`;
                break;
            case 'salary_range':
                prompt = 'Введите зарплатный диапазон (или "пропустить"):';
                break;
            case 'description':
                prompt = 'Введите описание роли (или "пропустить"):';
                break;
        }

        await ctx.reply(
            `✏️ <b>Редактирование: ${field}</b>\n\n` +
            `Текущее значение: <b>${currentValue || 'Не указано'}</b>\n\n` +
            prompt,
            { 
                parse_mode: 'HTML',
                reply_markup: {
                    keyboard: [['❌ Отменить редактирование']],
                    resize_keyboard: true,
                    one_time_keyboard: true
                }
            }
        );

        await ctx.answerCbQuery();

    } catch (error) {
        console.error('Error in startEditRole:', error);
        await ctx.answerCbQuery('❌ Произошла ошибка при начале редактирования');
    }
};

// Обработка шагов редактирования вакансии
const handleRoleEditStep = async (ctx) => {
    try {
        if (!ctx.session?.editingRole) {
            return false;
        }

        const text = ctx.message.text;

        if (text === '❌ Отменить редактирование') {
            delete ctx.session.editingRole;
            await ctx.reply(
                '❌ Редактирование отменено.',
                { 
                    reply_markup: getKeyboardByRole(ctx.user.main_role, await User.isManagerProfileFullyComplete(ctx.user.telegram_id)).reply_markup
                }
            );
            return true;
        }

        const { roleId, field } = ctx.session.editingRole;
        let value = text;

        // Валидация в зависимости от поля
        if (field === 'positions_count') {
            const positionsCount = parseInt(text);
            if (isNaN(positionsCount) || positionsCount < 1) {
                await ctx.reply('❌ Введите корректное число позиций (минимум 1):');
                return true;
            }
            value = positionsCount;
        } else if (field === 'required_skills' || field === 'salary_range' || field === 'description') {
            if (text.toLowerCase() === 'пропустить') {
                value = null;
            }
        }

        // Сохраняем изменения
        await ProjectRole.updateField(roleId, field, value);

        // Получаем обновленную вакансию
        const updatedRole = await ProjectRole.findById(roleId);
        
        await ctx.reply(
            `✅ <b>Вакансия обновлена!</b>\n\n` +
            `🔹 <b>Роль:</b> ${updatedRole.role_name}\n` +
            `🔹 <b>Навыки:</b> ${updatedRole.required_skills || 'Не указаны'}\n` +
            `🔹 <b>Позиций:</b> ${updatedRole.filled_positions}/${updatedRole.positions_count}\n` +
            `🔹 <b>Зарплата:</b> ${updatedRole.salary_range || 'Не указана'}\n` +
            `🔹 <b>Описание:</b> ${updatedRole.description || 'Не указано'}`,
            { 
                parse_mode: 'HTML',
                reply_markup: getKeyboardByRole(ctx.user.main_role, await User.isManagerProfileFullyComplete(ctx.user.telegram_id)).reply_markup
            }
        );

        delete ctx.session.editingRole;
        return true;

    } catch (error) {
        console.error('Error in handleRoleEditStep:', error);
        await ctx.reply('❌ Произошла ошибка при сохранении изменений.');
        return true;
    }
};

// Удаление вакансии
const deleteRole = async (ctx) => {
    try {
        const roleId = parseInt(ctx.match[1]);
        
        const role = await ProjectRole.findById(roleId);
        if (!role) {
            await ctx.answerCbQuery('❌ Вакансия не найдена');
            return;
        }

        // Проверяем права доступа
        const project = await Project.findById(role.project_id);
        const managers = await ProjectManager.findByProject(role.project_id);
        const isManager = managers.some(m => m.manager_id === ctx.user.id && m.status === 'accepted');
        
        if (!isManager && project.customer_id !== ctx.user.id) {
            await ctx.answerCbQuery('❌ У вас нет прав для удаления этой вакансии');
            return;
        }

        // Проверяем, есть ли активные заявки на эту вакансию
        const ExecutorApplication = require('../../db/models/ExecutorApplication');
        const applications = await ExecutorApplication.findByRole(roleId);
        const activeApplications = applications.filter(app => app.status === 'pending' || app.status === 'invited');
        const acceptedApplications = applications.filter(app => app.status === 'accepted');
        
        // Проверяем, есть ли назначенные исполнители на эту роль
        const projectMembers = await Project.getMembers(role.project_id);
        const roleExecutors = projectMembers.filter(member => 
            member.member_role === 'executor' && member.role_id === roleId
        );

        // Если есть активные отклики или назначенные исполнители, показываем предупреждение
        if (activeApplications.length > 0 || roleExecutors.length > 0) {
            let message = `⚠️ <b>Невозможно удалить вакансию</b>\n\n`;
            message += `Роль: <b>${role.role_name}</b>\n`;
            message += `Проект: <b>${project.name}</b>\n\n`;
            
            if (activeApplications.length > 0) {
                message += `📋 <b>Активные отклики:</b> ${activeApplications.length}\n`;
                message += `• Добровольные отклики: ${activeApplications.filter(app => app.status === 'pending').length}\n`;
                message += `• Направленные приглашения: ${activeApplications.filter(app => app.status === 'invited').length}\n\n`;
            }
            
            if (roleExecutors.length > 0) {
                message += `👥 <b>Назначенные исполнители:</b> ${roleExecutors.length}\n`;
                for (const executor of roleExecutors) {
                    const executorName = executor.username ? `@${executor.username}` : `${executor.first_name} ${executor.last_name || ''}`;
                    message += `• ${executorName}\n`;
                }
                message += `\n`;
            }
            
            message += `Для удаления вакансии необходимо:\n`;
            if (activeApplications.length > 0) {
                message += `1. Отклонить все активные отклики\n`;
            }
            if (roleExecutors.length > 0) {
                message += `2. Исключить всех назначенных исполнителей\n`;
            }

            const buttons = [];
            
            if (activeApplications.length > 0) {
                buttons.push([
                    { text: '❌ Отклонить все отклики', callback_data: `decline_all_applications_${roleId}` }
                ]);
            }
            
            if (roleExecutors.length > 0) {
                buttons.push([
                    { text: '👥 Исключить всех исполнителей', callback_data: `remove_all_executors_${roleId}` }
                ]);
            }
            
            buttons.push([
                { text: '🔙 Назад', callback_data: `edit_vacancies_${role.project_id}` }
            ]);

            await ctx.editMessageText(message, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: buttons
                }
            });

            await ctx.answerCbQuery();
            return;
        }

        // Если нет активных откликов и исполнителей, удаляем вакансию
        await ProjectRole.delete(roleId);

        await ctx.editMessageText(
            `🗑 <b>Вакансия удалена!</b>\n\n` +
            `Роль "${role.role_name}" была удалена из проекта.`,
            {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '🔙 Назад к вакансиям', callback_data: `edit_vacancies_${role.project_id}` }
                        ]
                    ]
                }
            }
        );

        await ctx.answerCbQuery();

    } catch (error) {
        console.error('Error in deleteRole:', error);
        await ctx.answerCbQuery('❌ Произошла ошибка при удалении вакансии');
    }
};

// Поиск исполнителей для проекта
const searchExecutors = async (ctx) => {
    try {
        const projectId = parseInt(ctx.match[1]);
        
        const project = await Project.findById(projectId);
        if (!project) {
            await ctx.answerCbQuery('❌ Проект не найден');
            return;
        }

        // Проверяем права доступа (только менеджер проекта)
        const managers = await ProjectManager.findByProject(projectId);
        const isManager = managers.some(m => m.manager_id === ctx.user.id && m.status === 'accepted');
        
        if (!isManager && project.customer_id !== ctx.user.id) {
            await ctx.answerCbQuery('❌ У вас нет прав для поиска исполнителей');
            return;
        }

        // Получаем вакансии с свободными позициями
        const projectRoles = await ProjectRole.findByProjectId(projectId);
        const availableRoles = projectRoles.filter(role => 
            role.positions_count > role.filled_positions
        );
        
        if (availableRoles.length === 0) {
            await ctx.answerCbQuery('❌ Нет свободных позиций для поиска исполнителей');
            return;
        }

        // Получаем всех исполнителей с открытым профилем
        const executors = await User.findVisibleByRole('executor');
        if (!executors || executors.length === 0) {
            await ctx.answerCbQuery('❌ В системе нет доступных исполнителей');
            return;
        }

        // Показываем список исполнителей
        let message = `🔍 <b>Поиск исполнителей для проекта "${project.name}"</b>\n\n`;
        message += `Найдено ${executors.length} исполнителей с открытым профилем.\n\n`;
        message += `Выберите исполнителя для просмотра профиля и предложения вакансии:`;

        const executorButtons = [];
        for (const executor of executors) {
            executorButtons.push([
                { 
                    text: `👤 @${executor.username}`, 
                    callback_data: `view_executor_profile_${projectId}_${executor.id}` 
                }
            ]);
        }

        executorButtons.push([
            { text: '🔙 Назад к проекту', callback_data: `project_details_${projectId}` }
        ]);

        await ctx.editMessageText(message, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: executorButtons
            }
        });

        await ctx.answerCbQuery();

    } catch (error) {
        console.error('Error in searchExecutors:', error);
        await ctx.answerCbQuery('❌ Произошла ошибка при поиске исполнителей');
    }
};

// Просмотр профиля исполнителя
const viewExecutorProfile = async (ctx) => {
    try {
        const projectId = parseInt(ctx.match[1]);
        const executorId = parseInt(ctx.match[2]);
        
        const project = await Project.findById(projectId);
        const executor = await User.findById(executorId);
        
        if (!project || !executor) {
            await ctx.answerCbQuery('❌ Проект или исполнитель не найден');
            return;
        }

        // Проверяем права доступа
        const managers = await ProjectManager.findByProject(projectId);
        const isManager = managers.some(m => m.manager_id === ctx.user.id && m.status === 'accepted');
        
        if (!isManager && project.customer_id !== ctx.user.id) {
            await ctx.answerCbQuery('❌ У вас нет прав для просмотра профилей исполнителей');
            return;
        }

        // Получаем профиль исполнителя
        const executorProfile = await User.getExecutorProfile(executor.telegram_id);
        
        // Получаем доступные вакансии
        const projectRoles = await ProjectRole.findByProjectId(projectId);
        const availableRoles = projectRoles.filter(role => 
            role.positions_count > role.filled_positions
        );

        let message = `👤 <b>Профиль исполнителя</b>\n\n`;
        message += `Имя: <b>${executor.first_name} ${executor.last_name || ''}</b>\n`;
        message += `Username: @${executor.username || 'нет'}\n`;
        
        if (executorProfile) {
            if (executorProfile.specialization) {
                message += `Специализация: ${executorProfile.specialization}\n`;
            }
            if (executorProfile.skills) {
                let skills = executorProfile.skills;
                if (Array.isArray(skills)) {
                    skills = skills.join(', ');
                }
                message += `Навыки: ${skills}\n`;
            }
            if (executorProfile.contacts) {
                message += `Контакты: ${executorProfile.contacts}\n`;
            }
            if (executorProfile.achievements) {
                message += `О себе: ${executorProfile.achievements}\n`;
            }
        }
        
        message += `\n📋 <b>Доступные вакансии в проекте:</b>\n`;
        for (const role of availableRoles) {
            const availablePositions = role.positions_count - role.filled_positions;
            message += `\n🔹 <b>${role.role_name}</b>\n`;
            message += `   📊 Свободных позиций: ${availablePositions}/${role.positions_count}\n`;
            if (role.required_skills) {
                message += `   🛠 Требуемые навыки: ${role.required_skills}\n`;
            }
            if (role.salary_range) {
                message += `   💰 Зарплата: ${role.salary_range}\n`;
            }
            if (role.description) {
                message += `   📝 Описание: ${role.description}\n`;
            }
        }

        const roleButtons = availableRoles.map(role => [
            { 
                text: `✅ Предложить "${role.role_name}"`, 
                callback_data: `invite_executor_${projectId}_${executorId}_${role.id}` 
            }
        ]);

        roleButtons.push([
            { text: '🔙 Назад к поиску', callback_data: `search_executors_${projectId}` }
        ]);

        await ctx.editMessageText(message, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: roleButtons
            }
        });

        await ctx.answerCbQuery();

    } catch (error) {
        console.error('Error in viewExecutorProfile:', error);
        await ctx.answerCbQuery('❌ Произошла ошибка при загрузке профиля');
    }
};

// Приглашение исполнителя на вакансию
const inviteExecutor = async (ctx) => {
    try {
        const projectId = parseInt(ctx.match[1]);
        const executorId = parseInt(ctx.match[2]);
        const roleId = parseInt(ctx.match[3]);
        
        const project = await Project.findById(projectId);
        const executor = await User.findById(executorId);
        const role = await ProjectRole.findById(roleId);
        
        if (!project || !executor || !role) {
            await ctx.answerCbQuery('❌ Проект, исполнитель или вакансия не найдены');
            return;
        }

        // Проверяем права доступа
        const managers = await ProjectManager.findByProject(projectId);
        const isManager = managers.some(m => m.manager_id === ctx.user.id && m.status === 'accepted');
        
        if (!isManager && project.customer_id !== ctx.user.id) {
            await ctx.answerCbQuery('❌ У вас нет прав для приглашения исполнителей');
            return;
        }

        // Проверяем, что позиция все еще свободна
        if (role.filled_positions >= role.positions_count) {
            await ctx.answerCbQuery('❌ Эта позиция уже занята');
            return;
        }

        // Проверяем, что исполнитель не уже приглашен на эту роль
        const ExecutorApplication = require('../../db/models/ExecutorApplication');
        const existingApplication = await ExecutorApplication.findByProjectAndExecutor(projectId, executorId);
        if (existingApplication && existingApplication.role_id === roleId && existingApplication.status === 'invited') {
            await ctx.answerCbQuery('❌ Этот исполнитель уже приглашен на эту роль');
            return;
        }

        // Создаем приглашение
        const application = await ExecutorApplication.createInvitation({
            project_id: projectId,
            role_id: roleId,
            executor_id: executorId
        });

        // Отправляем уведомление исполнителю
        const managerName = ctx.user.first_name + ' ' + (ctx.user.last_name || '');
        await ctx.telegram.sendMessage(
            executor.telegram_id,
            `🎉 <b>Вас пригласили на вакансию!</b>\n\n` +
            `Проект: <b>${project.name}</b>\n` +
            `Роль: <b>${role.role_name}</b>\n` +
            `Менеджер: ${managerName}\n\n` +
            `Для принятия или отклонения приглашения нажмите кнопку ниже:`,
            {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '✅ Принять приглашение', callback_data: `accept_invitation_${application.id}` },
                            { text: '❌ Отклонить', callback_data: `decline_invitation_${application.id}` }
                        ]
                    ]
                }
            }
        );

        await ctx.editMessageText(
            `✅ <b>Приглашение отправлено!</b>\n\n` +
            `Исполнитель @${executor.username} получил приглашение на роль "${role.role_name}" в проекте "${project.name}".\n\n` +
            `Ожидайте ответа от исполнителя.`,
            {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '🔙 Назад к поиску', callback_data: `search_executors_${projectId}` }
                        ]
                    ]
                }
            }
        );

        await ctx.answerCbQuery('✅ Приглашение отправлено!');

    } catch (error) {
        console.error('Error in inviteExecutor:', error);
        await ctx.answerCbQuery('❌ Произошла ошибка при отправке приглашения');
    }
};

// Обработка принятия приглашения исполнителем
const acceptInvitation = async (ctx) => {
    try {
        const applicationId = parseInt(ctx.match[1]);
        
        const ExecutorApplication = require('../../db/models/ExecutorApplication');
        const application = await ExecutorApplication.findById(applicationId);
        
        if (!application) {
            await ctx.answerCbQuery('❌ Приглашение не найдено');
            return;
        }

        // Проверяем, что это приглашение от менеджера
        if (application.status !== 'invited') {
            await ctx.answerCbQuery('❌ Это не приглашение от менеджера');
            return;
        }

        // Проверяем, что исполнитель еще не принял другое приглашение на эту роль
        const role = await ProjectRole.findById(application.role_id);
        if (role.filled_positions >= role.positions_count) {
            await ctx.answerCbQuery('❌ Эта позиция уже занята');
            return;
        }

        // Принимаем приглашение
        await ExecutorApplication.updateStatus(applicationId, 'accepted');
        
        // Добавляем исполнителя в проект
        await Project.addUserToProjectRoles(application.executor_id, application.project_id, 'executor');
        
        // Автоматически отклоняем все остальные приглашения на эту роль
        const otherInvitations = await ExecutorApplication.findByRole(application.role_id);
        const pendingInvitations = otherInvitations.filter(inv => 
            inv.status === 'invited' && inv.id !== applicationId
        );
        
        for (const invitation of pendingInvitations) {
            await ExecutorApplication.updateStatus(invitation.id, 'declined');
            
            // Уведомляем других кандидатов об отклонении
            const otherExecutor = await User.findById(invitation.executor_id);
            if (otherExecutor) {
                await ctx.telegram.sendMessage(
                    otherExecutor.telegram_id,
                    `❌ <b>Приглашение отклонено</b>\n\n` +
                    `Проект: <b>${project.name}</b>\n` +
                    `Роль: <b>${role.role_name}</b>\n\n` +
                    `На эту позицию был выбран другой кандидат.`,
                    { parse_mode: 'HTML' }
                );
            }
        }
        
        // Уведомляем менеджеров проекта
        const project = await Project.findById(application.project_id);
        const managers = await ProjectManager.findByProject(application.project_id);
        const acceptedManagers = managers.filter(m => m.status === 'accepted');
        
        for (const manager of acceptedManagers) {
            const managerUser = await User.findById(manager.manager_id);
            if (managerUser) {
                const executor = await User.findById(application.executor_id);
                await ctx.telegram.sendMessage(
                    managerUser.telegram_id,
                    `✅ <b>Исполнитель принял приглашение!</b>\n\n` +
                    `Проект: <b>${project.name}</b>\n` +
                    `Роль: <b>${role.role_name}</b>\n` +
                    `Исполнитель: @${executor.username}\n\n` +
                    `Исполнитель успешно добавлен в проект.\n` +
                    `Остальные кандидаты на эту роль автоматически отклонены.`,
                    { parse_mode: 'HTML' }
                );
            }
        }

        await ctx.editMessageText(
            `✅ <b>Приглашение принято!</b>\n\n` +
            `Вы успешно присоединились к проекту "${project.name}" на роль "${role.role_name}".\n\n` +
            `Менеджер проекта получил уведомление о вашем согласии.`,
            { parse_mode: 'HTML' }
        );

        await ctx.answerCbQuery('✅ Приглашение принято!');

    } catch (error) {
        console.error('Error in acceptInvitation:', error);
        await ctx.answerCbQuery('❌ Произошла ошибка при принятии приглашения');
    }
};

// Обработка отклонения приглашения исполнителем
const declineInvitation = async (ctx) => {
    try {
        const applicationId = parseInt(ctx.match[1]);
        
        const ExecutorApplication = require('../../db/models/ExecutorApplication');
        const application = await ExecutorApplication.findById(applicationId);
        
        if (!application) {
            await ctx.answerCbQuery('❌ Приглашение не найдено');
            return;
        }

        // Проверяем, что это приглашение от менеджера
        if (application.status !== 'invited') {
            await ctx.answerCbQuery('❌ Это не приглашение от менеджера');
            return;
        }

        // Отклоняем приглашение
        await ExecutorApplication.updateStatus(applicationId, 'declined');
        
        // Уведомляем менеджеров проекта
        const project = await Project.findById(application.project_id);
        const role = await ProjectRole.findById(application.role_id);
        const managers = await ProjectManager.findByProject(application.project_id);
        const acceptedManagers = managers.filter(m => m.status === 'accepted');
        
        for (const manager of acceptedManagers) {
            const managerUser = await User.findById(manager.manager_id);
            if (managerUser) {
                const executor = await User.findById(application.executor_id);
                await ctx.telegram.sendMessage(
                    managerUser.telegram_id,
                    `❌ <b>Исполнитель отклонил приглашение</b>\n\n` +
                    `Проект: <b>${project.name}</b>\n` +
                    `Роль: <b>${role.role_name}</b>\n` +
                    `Исполнитель: @${executor.username}\n\n` +
                    `Позиция остается свободной для других кандидатов.`,
                    { parse_mode: 'HTML' }
                );
            }
        }

        await ctx.editMessageText(
            `❌ <b>Приглашение отклонено</b>\n\n` +
            `Вы отклонили приглашение на роль "${role.role_name}" в проекте "${project.name}".\n\n` +
            `Менеджер проекта получил уведомление об отказе.`,
            { parse_mode: 'HTML' }
        );

        await ctx.answerCbQuery('❌ Приглашение отклонено');

    } catch (error) {
        console.error('Error in declineInvitation:', error);
        await ctx.answerCbQuery('❌ Произошла ошибка при отклонении приглашения');
    }
};

// Подтверждение принятия приглашения
const confirmAcceptInvitation = async (ctx) => {
    try {
        const applicationId = parseInt(ctx.match[1]);
        
        const ExecutorApplication = require('../../db/models/ExecutorApplication');
        const application = await ExecutorApplication.findById(applicationId);
        
        if (!application) {
            await ctx.answerCbQuery('❌ Приглашение не найдено');
            return;
        }

        if (application.status !== 'invited') {
            await ctx.answerCbQuery('❌ Приглашение уже обработано');
            return;
        }

        // Принимаем приглашение (меняем статус на accepted)
        await ExecutorApplication.updateStatus(applicationId, 'accepted');
        
        // Добавляем исполнителя в проект
        const project = await Project.findById(application.project_id);
        const hasMember = await Project.hasMember(application.project_id, application.executor_id, 'executor');
        
        if (!hasMember) {
            await Project.addMember(application.project_id, application.executor_id, 'executor', application.role_id);
        }
        
        // Уведомляем исполнителя
        const executorUser = await User.findById(application.executor_id);
        if (executorUser) {
            await ctx.telegram.sendMessage(
                executorUser.telegram_id,
                `🎉 <b>Ваше приглашение принято!</b>\n\n` +
                `Проект: <b>${project.name}</b>\n` +
                `Роль: <b>${application.role_name}</b>\n\n` +
                `Поздравляем! Вы были приняты в команду проекта.\n` +
                `Менеджер проекта свяжется с вами для дальнейших инструкций.`,
                { parse_mode: 'HTML' }
            );
        }

        // Логируем событие
        await AuditLog.create(
            ctx.user.id,
            'INVITATION_ACCEPTED',
            application.project_id,
            { 
                executorId: application.executor_id,
                executorUsername: executorUser?.username,
                roleName: application.role_name,
                applicationId: applicationId
            }
        );

        await ctx.editMessageText(
            `✅ <b>Приглашение принято!</b>\n\n` +
            `Исполнитель: <b>@${executorUser?.username || executorUser?.first_name}</b>\n` +
            `Роль: <b>${application.role_name}</b>\n` +
            `Проект: <b>${project.name}</b>\n\n` +
            `Исполнитель получил уведомление о принятии.`,
            { 
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '📤 Направленные приглашения', callback_data: `view_invitations_${application.project_id}` }
                        ],
                        [
                            { text: '🔙 К проекту', callback_data: `project_details_${application.project_id}` }
                        ]
                    ]
                }
            }
        );

        await ctx.answerCbQuery('✅ Приглашение успешно принято!');

    } catch (error) {
        console.error('Error in confirmAcceptInvitation:', error);
        await ctx.answerCbQuery('❌ Произошла ошибка при принятии приглашения');
    }
};

// Подтверждение отклонения приглашения
const confirmDeclineInvitation = async (ctx) => {
    try {
        const applicationId = parseInt(ctx.match[1]);
        
        const ExecutorApplication = require('../../db/models/ExecutorApplication');
        const application = await ExecutorApplication.findById(applicationId);
        
        if (!application) {
            await ctx.answerCbQuery('❌ Приглашение не найдено');
            return;
        }

        if (application.status !== 'invited') {
            await ctx.answerCbQuery('❌ Приглашение уже обработано');
            return;
        }

        // Отклоняем приглашение
        await ExecutorApplication.updateStatus(applicationId, 'declined');
        
        // Уведомляем исполнителя
        const executorUser = await User.findById(application.executor_id);
        const project = await Project.findById(application.project_id);
        
        if (executorUser) {
            await ctx.telegram.sendMessage(
                executorUser.telegram_id,
                `❌ <b>Ваше приглашение отклонено</b>\n\n` +
                `Проект: <b>${project.name}</b>\n` +
                `Роль: <b>${application.role_name}</b>\n\n` +
                `К сожалению, ваше приглашение было отклонено менеджером проекта.`,
                { parse_mode: 'HTML' }
            );
        }

        // Логируем событие
        await AuditLog.create(
            ctx.user.id,
            'INVITATION_DECLINED',
            application.project_id,
            { 
                executorId: application.executor_id,
                executorUsername: executorUser?.username,
                roleName: application.role_name,
                applicationId: applicationId
            }
        );

        await ctx.editMessageText(
            `❌ <b>Приглашение отклонено</b>\n\n` +
            `Исполнитель: <b>@${executorUser?.username || executorUser?.first_name}</b>\n` +
            `Роль: <b>${application.role_name}</b>\n` +
            `Проект: <b>${project.name}</b>\n\n` +
            `Исполнитель получил уведомление об отклонении.`,
            { 
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '📤 Направленные приглашения', callback_data: `view_invitations_${application.project_id}` }
                        ],
                        [
                            { text: '🔙 К проекту', callback_data: `project_details_${application.project_id}` }
                        ]
                    ]
                }
            }
        );

        await ctx.answerCbQuery('❌ Приглашение отклонено');

    } catch (error) {
        console.error('Error in confirmDeclineInvitation:', error);
        await ctx.answerCbQuery('❌ Произошла ошибка при отклонении приглашения');
    }
};

// Принятие приглашений
const acceptInvitations = async (ctx) => {
    try {
        const projectId = parseInt(ctx.match[1]);
        
        const project = await Project.findById(projectId);
        if (!project) {
            await ctx.answerCbQuery('❌ Проект не найден');
            return;
        }

        // Проверяем права доступа
        const managers = await ProjectManager.findByProject(projectId);
        const isManager = managers.some(m => m.manager_id === ctx.user.id && m.status === 'accepted');
        
        if (!isManager && project.customer_id !== ctx.user.id) {
            await ctx.answerCbQuery('❌ У вас нет прав для принятия приглашений');
            return;
        }

        // Получаем направленные приглашения
        const ExecutorApplication = require('../../db/models/ExecutorApplication');
        const applications = await ExecutorApplication.findByProject(projectId);
        const invitedApps = applications.filter(app => app.status === 'invited');
        
        if (invitedApps.length === 0) {
            await ctx.answerCbQuery('❌ Нет активных приглашений');
            return;
        }

        // Показываем список приглашений для выбора
        let message = `✅ <b>Выберите приглашение для принятия:</b>\n\n`;
        message += `Проект: <b>${project.name}</b>\n\n`;
        
        const buttons = [];
        for (const app of invitedApps) {
            const executorName = app.username ? `@${app.username}` : `${app.first_name} ${app.last_name || ''}`;
            message += `👤 <b>${executorName}</b>\n`;
            message += `   🎯 Роль: ${app.role_name}\n`;
            message += `   🛠 Специализация: ${app.specialization || 'Не указана'}\n`;
            message += `   📅 Приглашение отправлено: ${new Date(app.created_at).toLocaleDateString('ru-RU')}\n\n`;
            
            buttons.push([
                { 
                    text: `✅ Принять ${executorName}`, 
                    callback_data: `confirm_accept_invitation_${app.id}` 
                }
            ]);
        }

        buttons.push([
            { text: '🔙 Назад', callback_data: `view_invitations_${projectId}` }
        ]);

        await ctx.editMessageText(message, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: buttons
            }
        });

        await ctx.answerCbQuery();

    } catch (error) {
        console.error('Error in acceptInvitations:', error);
        await ctx.answerCbQuery('❌ Произошла ошибка');
    }
};

// Отклонение приглашений
const declineInvitations = async (ctx) => {
    try {
        const projectId = parseInt(ctx.match[1]);
        
        const project = await Project.findById(projectId);
        if (!project) {
            await ctx.answerCbQuery('❌ Проект не найден');
            return;
        }

        // Проверяем права доступа
        const managers = await ProjectManager.findByProject(projectId);
        const isManager = managers.some(m => m.manager_id === ctx.user.id && m.status === 'accepted');
        
        if (!isManager && project.customer_id !== ctx.user.id) {
            await ctx.answerCbQuery('❌ У вас нет прав для отклонения приглашений');
            return;
        }

        // Получаем направленные приглашения
        const ExecutorApplication = require('../../db/models/ExecutorApplication');
        const applications = await ExecutorApplication.findByProject(projectId);
        const invitedApps = applications.filter(app => app.status === 'invited');
        
        if (invitedApps.length === 0) {
            await ctx.answerCbQuery('❌ Нет активных приглашений');
            return;
        }

        // Показываем список приглашений для выбора
        let message = `❌ <b>Выберите приглашение для отклонения:</b>\n\n`;
        message += `Проект: <b>${project.name}</b>\n\n`;
        
        const buttons = [];
        for (const app of invitedApps) {
            const executorName = app.username ? `@${app.username}` : `${app.first_name} ${app.last_name || ''}`;
            message += `👤 <b>${executorName}</b>\n`;
            message += `   🎯 Роль: ${app.role_name}\n`;
            message += `   🛠 Специализация: ${app.specialization || 'Не указана'}\n`;
            message += `   📅 Приглашение отправлено: ${new Date(app.created_at).toLocaleDateString('ru-RU')}\n\n`;
            
            buttons.push([
                { 
                    text: `❌ Отклонить ${executorName}`, 
                    callback_data: `confirm_decline_invitation_${app.id}` 
                }
            ]);
        }

        buttons.push([
            { text: '🔙 Назад', callback_data: `view_invitations_${projectId}` }
        ]);

        await ctx.editMessageText(message, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: buttons
            }
        });

        await ctx.answerCbQuery();

    } catch (error) {
        console.error('Error in declineInvitations:', error);
        await ctx.answerCbQuery('❌ Произошла ошибка');
    }
};

// Просмотр направленных приглашений
const viewInvitations = async (ctx) => {
    try {
        const projectId = parseInt(ctx.match[1]);
        
        const project = await Project.findById(projectId);
        if (!project) {
            await ctx.answerCbQuery('❌ Проект не найден');
            return;
        }

        // Проверяем права доступа (только менеджер проекта)
        const managers = await ProjectManager.findByProject(projectId);
        const isManager = managers.some(m => m.manager_id === ctx.user.id && m.status === 'accepted');
        
        if (!isManager && project.customer_id !== ctx.user.id) {
            await ctx.answerCbQuery('❌ У вас нет прав для просмотра приглашений');
            return;
        }

        // Получаем направленные приглашения
        const ExecutorApplication = require('../../db/models/ExecutorApplication');
        const applications = await ExecutorApplication.findByProject(projectId);
        const invitedApps = applications.filter(app => app.status === 'invited');
        
        if (invitedApps.length === 0) {
            await ctx.editMessageText(
                `📤 <b>Направленные приглашения</b>\n\n` +
                `❌ Нет активных приглашений.`,
                { 
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '🔙 Назад к откликам', callback_data: `view_applications_${projectId}` }
                            ]
                        ]
                    }
                }
            );
            return;
        }

        let message = `📤 <b>Направленные приглашения</b>\n\n`;
        message += `Проект: <b>${project.name}</b>\n\n`;
        
        // Группируем приглашения по ролям
        const invitationsByRole = {};
        for (const app of invitedApps) {
            if (!invitationsByRole[app.role_id]) {
                invitationsByRole[app.role_id] = [];
            }
            invitationsByRole[app.role_id].push(app);
        }

        for (const [roleId, apps] of Object.entries(invitationsByRole)) {
            const firstApp = apps[0];
            message += `🎯 <b>Роль: ${firstApp.role_name}</b>\n`;
            message += `📊 Приглашено кандидатов: ${apps.length}\n\n`;
            
            for (const app of apps) {
                const executorName = app.username ? `@${app.username}` : `${app.first_name} ${app.last_name || ''}`;
                message += `👤 <b>${executorName}</b>\n`;
                message += `   🛠 Специализация: ${app.specialization || 'Не указана'}\n`;
                if (app.skills) {
                    let skills = app.skills;
                    if (Array.isArray(skills)) {
                        skills = skills.join(', ');
                    }
                    message += `   💡 Навыки: ${skills}\n`;
                }
                if (app.contacts) {
                    message += `   📞 Контакты: ${app.contacts}\n`;
                }
                message += `   📅 Приглашение отправлено: ${new Date(app.created_at).toLocaleDateString('ru-RU')}\n`;
                message += `   ⏳ Статус: Ожидает ответа\n\n`;
            }
        }

        const buttons = [
            [
                { text: '🔙 Назад к откликам', callback_data: `view_applications_${projectId}` }
            ]
        ];

        await ctx.editMessageText(message, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: buttons
            }
        });

        await ctx.answerCbQuery();

    } catch (error) {
        console.error('Error in viewInvitations:', error);
        await ctx.answerCbQuery('❌ Произошла ошибка при загрузке приглашений');
    }
};

// Добавление принятых приглашений в проект
const addAcceptedToProject = async (ctx) => {
    try {
        const projectId = parseInt(ctx.match[1]);
        
        const project = await Project.findById(projectId);
        if (!project) {
            await ctx.answerCbQuery('❌ Проект не найден');
            return;
        }

        // Проверяем права доступа
        const managers = await ProjectManager.findByProject(projectId);
        const isManager = managers.some(m => m.manager_id === ctx.user.id && m.status === 'accepted');
        
        if (!isManager && project.customer_id !== ctx.user.id) {
            await ctx.answerCbQuery('❌ У вас нет прав для добавления исполнителей в проект');
            return;
        }

        // Получаем принятые приглашения
        const ExecutorApplication = require('../../db/models/ExecutorApplication');
        const applications = await ExecutorApplication.findByProject(projectId);
        const acceptedApps = applications.filter(app => app.status === 'accepted');
        
        if (acceptedApps.length === 0) {
            await ctx.answerCbQuery('❌ Нет принятых приглашений для добавления в проект');
            return;
        }

        // Показываем список принятых приглашений для добавления в проект
        let message = `✅ <b>Добавление исполнителей в проект:</b>\n\n`;
        message += `Проект: <b>${project.name}</b>\n\n`;
        message += `Выберите исполнителей, которых хотите добавить в проект:\n\n`;
        
        const buttons = [];
        for (const app of acceptedApps) {
            const executorName = app.username ? `@${app.username}` : `${app.first_name} ${app.last_name || ''}`;
            message += `👤 <b>${executorName}</b>\n`;
            message += `   🎯 Роль: ${app.role_name}\n`;
            message += `   🛠 Специализация: ${app.specialization || 'Не указана'}\n`;
            message += `   📅 Приглашение принято: ${new Date(app.updated_at).toLocaleDateString('ru-RU')}\n\n`;
            
            buttons.push([
                { 
                    text: `✅ Добавить ${executorName}`, 
                    callback_data: `confirm_add_to_project_${app.id}` 
                }
            ]);
        }

        buttons.push([
            { text: '🔙 Назад', callback_data: `view_applications_${projectId}` }
        ]);

        await ctx.editMessageText(message, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: buttons
            }
        });

        await ctx.answerCbQuery();

    } catch (error) {
        console.error('Error in addAcceptedToProject:', error);
        await ctx.answerCbQuery('❌ Произошла ошибка');
    }
};

// Подтверждение добавления исполнителя в проект
const confirmAddToProject = async (ctx) => {
    try {
        const applicationId = parseInt(ctx.match[1]);
        
        const ExecutorApplication = require('../../db/models/ExecutorApplication');
        const application = await ExecutorApplication.findById(applicationId);
        
        if (!application) {
            await ctx.answerCbQuery('❌ Приглашение не найдено');
            return;
        }

        if (application.status !== 'accepted') {
            await ctx.answerCbQuery('❌ Приглашение не было принято исполнителем');
            return;
        }

        // Проверяем, не добавлен ли уже исполнитель на эту роль в проект
        const hasMember = await Project.hasMember(application.project_id, application.executor_id, 'executor', application.role_id);
        
        if (hasMember) {
            await ctx.answerCbQuery('❌ Исполнитель уже добавлен на эту роль в проект');
            return;
        }

        // Добавляем исполнителя в проект
        const project = await Project.findById(application.project_id);
        await Project.addMember(application.project_id, application.executor_id, 'executor', application.role_id);
        
        // Уведомляем исполнителя
        const executorUser = await User.findById(application.executor_id);
        if (executorUser) {
            await ctx.telegram.sendMessage(
                executorUser.telegram_id,
                `🎉 <b>Вы добавлены в проект!</b>\n\n` +
                `Проект: <b>${project.name}</b>\n` +
                `Роль: <b>${application.role_name}</b>\n\n` +
                `Поздравляем! Вы официально стали участником проекта.\n` +
                `Менеджер проекта свяжется с вами для дальнейших инструкций.`,
                { parse_mode: 'HTML' }
            );
        }

        // Логируем событие
        await AuditLog.create(
            ctx.user.id,
            'EXECUTOR_ADDED_TO_PROJECT',
            application.project_id,
            { 
                executorId: application.executor_id,
                executorUsername: executorUser?.username,
                roleName: application.role_name,
                applicationId: applicationId
            }
        );

        await ctx.editMessageText(
            `✅ <b>Исполнитель добавлен в проект!</b>\n\n` +
            `Исполнитель: <b>@${executorUser?.username || executorUser?.first_name}</b>\n` +
            `Роль: <b>${application.role_name}</b>\n` +
            `Проект: <b>${project.name}</b>\n\n` +
            `Исполнитель получил уведомление о добавлении в проект.`,
            { 
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '✅ Добавить в проект', callback_data: `add_accepted_to_project_${application.project_id}` }
                        ],
                        [
                            { text: '🔙 К проекту', callback_data: `project_details_${application.project_id}` }
                        ]
                    ]
                }
            }
        );

        await ctx.answerCbQuery('✅ Исполнитель успешно добавлен в проект!');

    } catch (error) {
        console.error('Error in confirmAddToProject:', error);
        await ctx.answerCbQuery('❌ Произошла ошибка при добавлении в проект');
    }
};

// Отклонение всех откликов на роль
const declineAllApplications = async (ctx) => {
    try {
        const roleId = parseInt(ctx.match[1]);
        
        const role = await ProjectRole.findById(roleId);
        if (!role) {
            await ctx.answerCbQuery('❌ Вакансия не найдена');
            return;
        }

        // Проверяем права доступа
        const project = await Project.findById(role.project_id);
        const managers = await ProjectManager.findByProject(role.project_id);
        const isManager = managers.some(m => m.manager_id === ctx.user.id && m.status === 'accepted');
        
        if (!isManager && project.customer_id !== ctx.user.id) {
            await ctx.answerCbQuery('❌ У вас нет прав для отклонения откликов');
            return;
        }

        // Получаем активные отклики
        const ExecutorApplication = require('../../db/models/ExecutorApplication');
        const applications = await ExecutorApplication.findByRole(roleId);
        const activeApplications = applications.filter(app => app.status === 'pending' || app.status === 'invited');
        
        if (activeApplications.length === 0) {
            await ctx.answerCbQuery('❌ Нет активных откликов для отклонения');
            return;
        }

        // Отклоняем все активные отклики
        let declinedCount = 0;
        for (const application of activeApplications) {
            await ExecutorApplication.updateStatus(application.id, 'declined');
            declinedCount++;
            
            // Уведомляем исполнителя об отклонении
            const executorUser = await User.findById(application.executor_id);
            if (executorUser) {
                const message = application.status === 'pending' 
                    ? `❌ <b>Ваш отклик отклонен</b>\n\n` +
                      `Проект: <b>${project.name}</b>\n` +
                      `Роль: <b>${role.role_name}</b>\n\n` +
                      `К сожалению, ваш отклик был отклонен менеджером проекта.`
                    : `❌ <b>Ваше приглашение отклонено</b>\n\n` +
                      `Проект: <b>${project.name}</b>\n` +
                      `Роль: <b>${role.role_name}</b>\n\n` +
                      `К сожалению, ваше приглашение было отклонено менеджером проекта.`;
                
                await ctx.telegram.sendMessage(
                    executorUser.telegram_id,
                    message,
                    { parse_mode: 'HTML' }
                );
            }
        }

        // Логируем событие
        await AuditLog.create(
            ctx.user.id,
            'ALL_APPLICATIONS_DECLINED',
            role.project_id,
            { 
                roleId: roleId,
                roleName: role.role_name,
                declinedCount: declinedCount
            }
        );

        await ctx.editMessageText(
            `❌ <b>Все отклики отклонены!</b>\n\n` +
            `Роль: <b>${role.role_name}</b>\n` +
            `Проект: <b>${project.name}</b>\n` +
            `Отклонено откликов: <b>${declinedCount}</b>\n\n` +
            `Теперь вы можете удалить вакансию.`,
            { 
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '🗑 Удалить вакансию', callback_data: `delete_role_${roleId}` }
                        ],
                        [
                            { text: '🔙 Назад к вакансиям', callback_data: `edit_vacancies_${role.project_id}` }
                        ]
                    ]
                }
            }
        );

        await ctx.answerCbQuery(`✅ Отклонено ${declinedCount} откликов`);

    } catch (error) {
        console.error('Error in declineAllApplications:', error);
        await ctx.answerCbQuery('❌ Произошла ошибка при отклонении откликов');
    }
};

// Исключение всех исполнителей с роли
const removeAllExecutors = async (ctx) => {
    try {
        const roleId = parseInt(ctx.match[1]);
        
        const role = await ProjectRole.findById(roleId);
        if (!role) {
            await ctx.answerCbQuery('❌ Вакансия не найдена');
            return;
        }

        // Проверяем права доступа
        const project = await Project.findById(role.project_id);
        const managers = await ProjectManager.findByProject(role.project_id);
        const isManager = managers.some(m => m.manager_id === ctx.user.id && m.status === 'accepted');
        
        if (!isManager && project.customer_id !== ctx.user.id) {
            await ctx.answerCbQuery('❌ У вас нет прав для исключения исполнителей');
            return;
        }

        // Получаем исполнителей на этой роли
        const projectMembers = await Project.getMembers(role.project_id);
        const roleExecutors = projectMembers.filter(member => 
            member.member_role === 'executor' && member.role_id === roleId
        );
        
        if (roleExecutors.length === 0) {
            await ctx.answerCbQuery('❌ Нет исполнителей для исключения');
            return;
        }

        // Исключаем всех исполнителей с роли
        let removedCount = 0;
        for (const executor of roleExecutors) {
            // Удаляем исполнителя только с конкретной роли, а не полностью из проекта
            await Project.removeMemberFromRole(role.project_id, executor.id, roleId);
            removedCount++;
            
            // Уведомляем исполнителя об исключении
            const executorUser = await User.findById(executor.id);
            if (executorUser) {
                await ctx.telegram.sendMessage(
                    executorUser.telegram_id,
                    `❌ <b>Вы исключены с роли</b>\n\n` +
                    `Проект: <b>${project.name}</b>\n` +
                    `Роль: <b>${role.role_name}</b>\n\n` +
                    `К сожалению, вы были исключены с этой роли менеджером проекта.\n` +
                    `Вакансия "${role.role_name}" будет удалена.`,
                    { parse_mode: 'HTML' }
                );
            }
        }

        // Логируем событие
        await AuditLog.create(
            ctx.user.id,
            'ALL_EXECUTORS_REMOVED',
            role.project_id,
            { 
                roleId: roleId,
                roleName: role.role_name,
                removedCount: removedCount
            }
        );

        await ctx.editMessageText(
            `👥 <b>Все исполнители исключены!</b>\n\n` +
            `Роль: <b>${role.role_name}</b>\n` +
            `Проект: <b>${project.name}</b>\n` +
            `Исключено исполнителей: <b>${removedCount}</b>\n\n` +
            `Теперь вы можете удалить вакансию.`,
            { 
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '🗑 Удалить вакансию', callback_data: `delete_role_${roleId}` }
                        ],
                        [
                            { text: '🔙 Назад к вакансиям', callback_data: `edit_vacancies_${role.project_id}` }
                        ]
                    ]
                }
            }
        );

        await ctx.answerCbQuery(`✅ Исключено ${removedCount} исполнителей`);

    } catch (error) {
        console.error('Error in removeAllExecutors:', error);
        await ctx.answerCbQuery('❌ Произошла ошибка при исключении исполнителей');
    }
};

module.exports = {
    createProject,
    myProjects,
    projectDetails,
    startCreateProject,
    handleCreateProjectStep,
    deleteProject,
    handleDeleteConfirmation,
    performProjectDeletion,
    availableProjects,
    projectPreview,
    showProjectForExecutor,
    handleExecutorApplication,
    handleExecutorRoleSelection,
    startAddVacancies,
    handleVacancyStep,
    viewVacancies,
    editVacancies,
    viewApplications,
    acceptApplication,
    confirmAcceptApplication,
    declineApplication,
    confirmDeclineApplication,
    handleAlreadyAccepted,
    handleApplicationPending,
    handleReapplyDisabled,
    handleReapplySettings,
    handleSetReapply,
    handleRefreshProject,
    showRoleEditMenu,
    startEditRole,
    handleRoleEditStep,
    deleteRole,
    searchExecutors,
    viewExecutorProfile,
    inviteExecutor,
    acceptInvitation,
    declineInvitation,
    viewInvitations,
    acceptInvitations,
    declineInvitations,
    confirmAcceptInvitation,
    confirmDeclineInvitation,
    addAcceptedToProject,
    confirmAddToProject,
    declineAllApplications,
    removeAllExecutors,
    // Добавьте другие функции по необходимости
};