const Project = require('../../db/models/Project');
const User = require('../../db/models/User');
const AuditLog = require('../../db/models/AuditLog');
const ManagerInvitation = require('../../db/models/ManagerInvitation');
const ProjectManager = require('../../db/models/ProjectManager');
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
    console.log('[myProjects] START - message:', ctx.message.text);
    ctx.message.handled = true; // Помечаем сообщение как обработанное
    try {
        console.log('[myProjects] Start handling for user:', ctx.user?.id);
        if (!ctx.user) {
            console.log('[myProjects] No user in context');
            return ctx.reply('Пользователь не найден. Используйте /start');
        }
        if (!ctx.user?.main_role) {
            console.log('[myProjects] No main_role for user:', ctx.user?.id);
            return ctx.reply('У вас не выбрана роль. Используйте /start');
        }
        console.log('[myProjects] user main_role:', ctx.user.main_role);
        let projects = [];

        if (ctx.user.main_role === 'customer') {
            projects = await Project.findByCustomerId(ctx.user.id);
        } else if (ctx.user.main_role === 'manager') {
            projects = await Project.findByManagerId(ctx.user.id);
        } else {
            projects = await Project.findByMemberId(ctx.user.id);
        }

        console.log('[myProjects] projects found:', projects.length, projects.map(p => p.id));

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
        // --- Новый блок: статус менеджера и статус проекта ---
        const managers = await ProjectManager.findByProject(project.id);
        let acceptedManagers = [];
        let pendingManagers = [];
        for (const m of managers) {
            if (m.status === 'accepted') acceptedManagers.push(m);
            if (m.status === 'pending') pendingManagers.push(m);
        }
        // Сначала pending (на рассмотрении)
        if (pendingManagers.length > 0) {
            for (const m of pendingManagers) {
                const user = await User.findById(m.manager_id);
                message += `👨‍💼 <b>Менеджер:</b> @${user?.username || user?.first_name || 'Неизвестно'} (на рассмотрении)\n`;
            }
        }
        // Затем accepted (принял)
        if (acceptedManagers.length > 0) {
            for (const m of acceptedManagers) {
                const user = await User.findById(m.manager_id);
                message += `👨‍💼 <b>Менеджер:</b> @${user?.username || user?.first_name || 'Неизвестно'} (принял)\n`;
            }
        }
        // Если нет ни pending, ни accepted
        if (acceptedManagers.length === 0 && pendingManagers.length === 0) {
            message += `👨‍💼 <b>Менеджер:</b> Вы заказчик-менеджер\n`;
        }
        // --- статус проекта ---
        let statusText = '';
        if (project.status === 'searching_manager') statusText = 'В поисках менеджера';
        else if (project.status === 'searching_executors') statusText = 'В поисках исполнителей';
        else if (project.status === 'active' || project.status === 'in_progress') statusText = 'В работе';
        else if (project.status === 'draft') statusText = 'Черновик';
        else statusText = project.status;
        message += `📊 <b>Статус:</b> ${statusText}\n`;
        message += managerBlock + '\n\n';
        // --- конец блока ---

        // --- Показываем только заполненные поля проекта ---
        function isFilled(val) {
            if (!val) return false;
            const v = String(val).trim().toLowerCase();
            return v && v !== '...' && v !== 'нет';
        }
        if (isFilled(project.deadline)) message += `⏰ <b>Сроки:</b> ${project.deadline}\n`;
        if (isFilled(project.budget)) message += `💰 <b>Бюджет:</b> ${project.budget}\n`;
        message += `📋 <b>Требования к менеджеру:</b> ${project.manager_requirements || "не указаны"}\n`;
        message += `⚙️ <b>Условия работы:</b> ${project.work_conditions || "не указаны"}\n`;
        message += `📝 <b>Доп. пожелания:</b> ${project.additional_notes || "нет"}\n`;
        // --- конец блока ---

        // Показываем исполнителей
        const members = await Project.getMembers(project.id);
        let executors = members.filter(m => m.member_role === 'executor');
        if (executors.length > 0) {
            message += '👥 <b>Исполнители:</b>\n';
            for (const member of executors) {
                message += `• ${member.first_name} ${member.last_name || ''} (@${member.username})\n`;
            }
        } else {
            message += '👥 <b>Исполнители:</b> Пока нет исполнителей\n';
        }

        // --- Действия для заказчика при статусе searching_manager и pending-менеджере ---
        if (project.customer_id === ctx.user.id && project.status === 'searching_manager' && pendingManagers.length > 0) {
            await ctx.reply(message, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: 'Назначить другого менеджера', callback_data: `reassign_manager_${project.id}_${pendingManagers[0].manager_id}` }
                        ],
                        [
                            { text: 'Отклонить приглашение', callback_data: `cancel_manager_invite_${project.id}` },
                            { text: 'Обсудить', callback_data: `change_manager_offer_${project.id}` }
                        ]
                    ]
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
                            { text: '✅ Принять', callback_data: `accept_invite_${project.id}` },
                            { text: '❌ Отклонить', callback_data: `decline_invite_${project.id}` }
                        ],
                        [
                            { text: '💬 Обсудить', callback_data: `project_offer_${project.id}` }
                        ]
                    ]
                }
            });
            return;
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
        console.log('[startCreateProject] Start - User ID:', ctx.from?.id);
        console.log('[startCreateProject] User:', ctx.user);
        console.log('[startCreateProject] Session:', ctx.session);
        
        ctx.session = ctx.session || {};
        ctx.session.createProject = {
            step: 'name',
            data: {}
        };
        
        console.log('[startCreateProject] Session initialized, sending message');
        await ctx.reply('📝 Введите название проекта (от 3 до 100 символов):', cancelKeyboard);
        console.log('[startCreateProject] Message sent successfully');
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
            state.step = 'add_executors';
            return ctx.reply('Добавить исполнителей? (Да/Нет)', { ...confirmationKeyboard, ...cancelKeyboard });
        }
        case 'add_executors': {
            const answer = ctx.message.text.toLowerCase();
            if (answer === 'да' || answer === 'yes') {
                const executors = await User.findVisibleByRole('executor');
                if (!executors || executors.length === 0) {
                    await ctx.reply(
                        'В системе пока нет доступных исполнителей с открытым профилем.\n' +
                        'Вы сможете добавить их позже через редактирование проекта.',
                        cancelKeyboard
                    );
                    state.data.executors = [];
                    state.step = 'add_manager';
                    return ctx.reply('Добавить дополнительного менеджера? (Да/Нет)', { ...confirmationKeyboard, ...cancelKeyboard });
                } else {
                    let list = 'Список доступных исполнителей:\n';
                    for (const e of executors) {
                        list += `• @${e.username} — ${e.first_name || ''} ${e.last_name || ''}\n`;
                    }
                    list += '\nВведите username исполнителя через @ (или несколько через пробел, максимум 10):';
                    state.data.executors = [];
                    state.step = 'executors_input';
                    return ctx.reply(list, cancelKeyboard);
                }
            } else if (answer === 'нет' || answer === 'no') {
                state.step = 'add_manager';
                return ctx.reply('Добавить дополнительного менеджера? (Да/Нет)', { ...confirmationKeyboard, ...cancelKeyboard });
            } else {
                return ctx.reply('Пожалуйста, ответьте "Да" или "Нет".', cancelKeyboard);
            }
        }
        case 'executors_input': {
            const usernames = ctx.message.text.split(/\s+/).filter(u => u.startsWith('@'));
            if (usernames.length === 0 || usernames.length > 10) {
                return ctx.reply('❌ Введите от 1 до 10 username через @, разделяя пробелом.', cancelKeyboard);
            }
            state.data.executors = usernames;
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
            return ctx.reply('Укажите бюджет проекта (например: "100 000 руб." или "по договорённости"):', cancelKeyboard);
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
    if (d.executors && d.executors.length > 0) {
        summary += `Исполнители: ${d.executors.join(', ')}\n`;
    }
    if (d.manager) {
        summary += `Доп. менеджер: ${d.manager}\n`;
    }
    summary += '\nСоздать проект? (Да/Нет)';
    await ctx.reply(summary, { parse_mode: 'HTML' });
}

async function processUsers(usernames, role, projectId, ctx) {
    for (const username of usernames) {
        try {
            const cleanUsername = username.replace(/^@/, '');
            const user = await User.findByUsername(cleanUsername);
            if (user) {
                // Не добавлять самого себя как менеджера второй раз
                if (role === 'manager' && user.id === (ctx.user.id || ctx.user.telegram_id)) continue;
                await Project.addUserToProjectRoles(user.id, projectId, role);
            } else {
                await ctx.reply(`⚠️ Пользователь ${username} не найден`);
            }
        } catch (error) {
            console.error(`Error adding ${role} ${username}:`, error);
        }
    }
    // После добавления исполнителей — проверяем, можно ли активировать проект
    if (role === 'executor') {
        await Project.checkAndActivateProject(projectId);
    }
}

// TODO: Обернуть saveProject в транзакцию для атомарности операций создания проекта и ролей
async function saveProject(ctx) {
    try {
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
        if (d.executors && d.executors.length > 10) {
            await ctx.reply('❌ Максимум 10 исполнителей.');
            return;
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
        // Обработка исполнителей
        if (d.executors?.length > 0) {
            await processUsers(d.executors, 'executor', project.id, ctx);
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
                        `Вас пригласили в проект "${project.name}" от ${ctx.user.first_name} ${ctx.user.last_name || ''}\n\nБолее подробно о проекте можно посмотреть в разделе "Доступные проекты"`,
                        {
                            reply_markup: {
                                inline_keyboard: [
                                    [
                                        { text: 'Согласиться', callback_data: `accept_invite_${project.id}` },
                                        { text: 'Отказаться', callback_data: `decline_invite_${project.id}` }
                                    ]
                                ]
                            }
                        }
                    );
                }
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
            userId: ctx.from?.id,
            session: ctx.session?.createProject
        });
        await ctx.reply('❌ Ошибка при создании проекта. Попробуйте позже.');
    }
}

// Удаление проекта
const deleteProject = async (ctx) => {
    try {
        console.log('[deleteProject] Start for user:', ctx.user?.id);
        
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

        // Запрашиваем подтверждение
        ctx.session = ctx.session || {};
        ctx.session.pendingDelete = {
            projectId: projectId,
            projectName: project.name
        };

        await ctx.reply(
            `🗑️ <b>Подтверждение удаления проекта</b>\n\n`
        );
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
        const userInput = ctx.message.text.trim();
        if (userInput === 'ОТМЕНА') {
            delete ctx.session.pendingDelete;
            await ctx.reply(
                '✅ Удаление проекта отменено.',
                { reply_markup: getKeyboardByRole(ctx.user.main_role).reply_markup }
            );
            return true;
        }
        if (userInput === `УДАЛИТЬ ${projectId}`) {
            // Сначала логируем операцию (до удаления проекта)
            await AuditLog.logProjectDeleted(ctx.user.id, projectId, projectName);
            // Затем выполняем удаление
            const success = await Project.delete(projectId, ctx.user.id);
            if (success) {
                delete ctx.session.pendingDelete;
                await ctx.reply(
                    `✅ <b>Проект успешно удален!</b>\n\n` +
                    `Проект: ${projectName}\n` +
                    `ID: ${projectId}`,
                    { 
                        parse_mode: 'HTML',
                        reply_markup: getKeyboardByRole(ctx.user.main_role).reply_markup
                    }
                );
            } else {
                await ctx.reply('❌ Не удалось удалить проект. Попробуйте позже.');
            }
            return true;
        }
        // Неверный ввод
        await ctx.reply(
            '❌ Неверный ввод. Для подтверждения введите: <code>УДАЛИТЬ ' + projectId + '</code>\n' +
            'Для отмены введите: <code>ОТМЕНА</code>',
            { parse_mode: 'HTML' }
        );
        return true;
    } catch (error) {
        console.error('[handleDeleteConfirmation] Error:', error);
        await ctx.reply('❌ Произошла ошибка при удалении проекта.');
        delete ctx.session.pendingDelete;
        return true;
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
    availableProjects: undefined, // если есть, добавить функцию
    // Добавьте другие функции по необходимости
};