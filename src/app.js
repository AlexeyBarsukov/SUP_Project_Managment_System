const { Telegraf, session } = require('telegraf');
require('dotenv').config();

// Импорт middleware
const { roleCheck, customerOnly, managerOnly, executorOnly } = require('./bot/middlewares/roleCheck');
const { standardRateLimit, joinProjectRateLimit, createProjectLimit, redisClient } = require('./bot/middlewares/rateLimit');

// Импорт команд
const { startCommand, handleRoleSelection } = require('./bot/commands/start');
const { 
    createProject, 
    handleProjectName, 
    handleProjectDescription,
    myProjects,
    projectDetails,
    joinProject,
    availableProjects,
    startCreateProject,
    handleCreateProjectStep,
    deleteProject,
    handleDeleteConfirmation
} = require('./bot/commands/projects');

// Импорт команд профиля менеджера
const {
    handleProfileCommand,
    handleSpecialization,
    handleExperience,
    handleSkills,
    handleSkillsDone,
    handleSkillsClear,
    handleProfileBack,
    handleAchievements,
    handleSalary,
    handleSalaryRange,
    handleContacts,
    handleTextInput,
    handleFillAchievements,
    handleFillSalary,
    handleFillContacts
} = require('./bot/commands/profile');

// Импорт команд просмотра менеджеров
const {
    handleManagersCommand,
    handleManagerProfile,
    handleBackToManagers
} = require('./bot/commands/managers');

// Импорт клавиатур
const { getKeyboardByRole, roleSelectionKeyboard, profileKeyboard, getManagerMenuKeyboard } = require('./bot/keyboards');

// Импорт утилит
const { notifyAdminError } = require('./utils/notifications');
const { validateRole } = require('./utils/validation');
const User = require('./db/models/User');
const Project = require('./db/models/Project');
const ManagerInvitation = require('./db/models/ManagerInvitation');
const ProjectManager = require('./db/models/ProjectManager');
const ProjectMessage = require('./db/models/ProjectMessage');
const AuditLog = require('./db/models/AuditLog');

const ADMIN_ID = process.env.ADMIN_ID;

// Создание экземпляра бота
const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

// Подключение сессий
bot.use(session());

// Middleware для подтягивания пользователя по Telegram ID
bot.use(async (ctx, next) => {
    console.log('Middleware 1 - start');
    if (!ctx.user && ctx.from && ctx.from.id) {
        ctx.user = await User.findByTelegramId(ctx.from.id);
    }
    await next();
    console.log('Middleware 1 - end');
});

// Глобальная обработка ошибок
bot.catch((err, ctx) => {
    console.error('Bot error:', err);
    notifyAdminError(bot, err, `Command: ${ctx.message?.text || 'Unknown'}`);
    ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
});

// Обработка команды /start
bot.start(startCommand);

// Обработка выбора роли
bot.hears(['👤 Заказчик', '👨‍💼 Менеджер', '👷 Исполнитель'], handleRoleSelection);

// Обработка текстовых команд с проверкой ролей
bot.hears(/^\s*📋\s*Мои проекты\s*$/i,
    async (ctx, next) => {
      console.log('hears start');
      await next();
    },
    roleCheck(['customer','manager','executor']),
    async (ctx, next) => {
      console.log('before myProjects');
      ctx.message.handled = true;
      await next();
    },
    myProjects
  );
  
bot.hears('🔍 Доступные проекты', roleCheck(['manager', 'executor']), availableProjects);
bot.hears('🔍 Найти проекты', roleCheck(['executor']), availableProjects);

// Команды для заказчика
bot.hears('➕ Создать проект', 
    async (ctx, next) => {
        console.log('1. Кнопка "Создать проект" нажата');
        await next();
    },
    customerOnly,
    async (ctx, next) => {
        console.log('2. После customerOnly');
        await next();
    },
    createProjectLimit(2),
    async (ctx, next) => {
        console.log('3. После createProjectLimit');
        await next();
    },
    startCreateProject
);
bot.hears('🔍 Найти менеджеров', customerOnly, handleManagersCommand);
bot.hears('🔍 Найти исполнителей', customerOnly, async (ctx) => {
    // TODO: Реализовать поиск исполнителей
    await ctx.reply('🔍 <b>Поиск исполнителей</b>\n\nФункция в разработке.', { parse_mode: 'HTML' });
});

// Команды для менеджера
bot.hears(['📝 Заполнить профиль', '✏️ Редактировать профиль'], managerOnly, handleProfileCommand);
bot.hears('🔍 Найти исполнителей', managerOnly, async (ctx) => {
    // TODO: Реализовать поиск исполнителей
    await ctx.reply('🔍 <b>Поиск исполнителей</b>\n\nФункция в разработке.', { parse_mode: 'HTML' });
});

// Обработка кнопки "Профиль" с учетом ролей в проектах
bot.hears('⚙️ Профиль', roleCheck(), async (ctx) => {
    const roleNames = {
        'customer': 'Заказчик',
        'manager': 'Менеджер',
        'executor': 'Исполнитель'
    };
    
    // Получаем роли пользователя в проектах
    const projectRoles = await User.getProjectRoles(ctx.from.id);
    let rolesInfo = '';
    if (projectRoles.length > 0) {
        rolesInfo = '\n\n<b>Ваши роли в проектах:</b>\n';
        // Группируем роли по проекту
        const projectsMap = {};
        projectRoles.forEach(role => {
            if (!projectsMap[role.project_id]) {
                projectsMap[role.project_id] = { name: role.project_name, roles: [] };
            }
            projectsMap[role.project_id].roles.push(role.role);
        });
        for (const projectId in projectsMap) {
            const { name, roles } = projectsMap[projectId];
            let roleStr = '';
            if (roles.includes('customer')) {
                roleStr = 'Заказчик-менеджер';
            } else if (roles.includes('manager')) {
                roleStr = 'Менеджер';
            } else if (roles.includes('executor')) {
                roleStr = 'Исполнитель';
            }
            rolesInfo += `- ${name}: ${roleStr}\n`;
        }
    }
    
    // Добавляем информацию о лимите проектов для заказчика
    let projectLimitInfo = '';
    if (ctx.user.main_role === 'customer') {
        const userProjects = await Project.findByCustomerId(ctx.user.id);
        const currentProjects = userProjects.length;
        const maxProjects = 2;
        projectLimitInfo = `\n📊 <b>Лимит проектов:</b> ${currentProjects}/${maxProjects}\n`;
        if (currentProjects >= maxProjects) {
            projectLimitInfo += `⚠️ Достигнут лимит проектов. Удалите один из проектов для создания нового.\n`;
        } else {
            projectLimitInfo += `✅ Можете создать еще ${maxProjects - currentProjects} проект(ов).\n`;
        }
    }
    
    // Если менеджер, добавить раздел "О себе"
    let aboutMe = '';
    if (ctx.user.main_role === 'manager') {
        const profile = await User.getManagerProfile(ctx.user.telegram_id);
        if (profile && (profile.specialization || profile.experience || profile.skills || profile.achievements || profile.salary_range || profile.contacts)) {
            aboutMe += '\n\n<b>О себе:</b>\n';
            if (profile.specialization) aboutMe += `• <b>Специализация:</b> ${profile.specialization}\n`;
            if (profile.experience) aboutMe += `• <b>Опыт:</b> ${profile.experience}\n`;
            if (profile.skills && profile.skills.length > 0) {
                let skills = Array.isArray(profile.skills) ? profile.skills.join(', ') : profile.skills;
                aboutMe += `• <b>Навыки:</b> ${skills}\n`;
            }
            if (profile.achievements) aboutMe += `• <b>Достижения:</b> ${profile.achievements}\n`;
            if (profile.salary_range) aboutMe += `• <b>Зарплата:</b> ${profile.salary_range}\n`;
            if (profile.contacts) aboutMe += `• <b>Контакты:</b> ${profile.contacts}\n`;
        }
    }
    await ctx.reply(
        `👤 <b>Ваш профиль</b>\n\n` +
        `Имя: ${ctx.user.first_name} ${ctx.user.last_name || ''}\n` +
        `Основная роль: ${roleNames[ctx.user.main_role] || ctx.user.main_role}\n` +
        `Username: @${ctx.user.username || 'нет'}\n` +
        `Видимость: ${ctx.user.is_visible ? 'Открытый' : 'Закрытый'}` +
        projectLimitInfo +
        aboutMe +
        rolesInfo,
        {
            parse_mode: 'HTML',
            reply_markup: ctx.user.main_role === 'manager'
                ? getManagerMenuKeyboard(!!aboutMe).reply_markup
                : profileKeyboard(ctx.user.main_role, ctx.user.telegram_id, ADMIN_ID).reply_markup
        }
    );
});

// Обработка кнопки "Изменить роль"
bot.hears('👤 Изменить роль', roleCheck(), async (ctx) => {
    ctx.session = ctx.session || {};
    ctx.session.changingRole = true;
    await ctx.reply(
        '🔄 <b>Выберите новую роль:</b>',
        {
            parse_mode: 'HTML',
            reply_markup: roleSelectionKeyboard.reply_markup
        }
    );
});

// Обработка выбора новой роли при смене с учетом проверки
bot.hears(['👤 Заказчик', '👨‍💼 Менеджер', '👷 Исполнитель'], async (ctx, next) => {
    if (ctx.session && ctx.session.changingRole) {
        const roleMap = {
            '👤 Заказчик': 'customer',
            '👨‍💼 Менеджер': 'manager',
            '👷 Исполнитель': 'executor'
        };
        const selectedRole = roleMap[ctx.message.text];
        if (!selectedRole) {
            return ctx.reply('❌ Неверный выбор роли. Попробуйте еще раз.');
        }
        // Проверка возможности смены роли
        const { canChange, error } = await User.canChangeRole(ctx.from.id, selectedRole);
        if (!canChange) {
            ctx.session.changingRole = false;
            return ctx.reply(`❌ ${error}`);
        }
        // Обновляем основную роль
        const user = await User.updateMainRole(ctx.from.id, selectedRole);
        if (!user) {
            ctx.session.changingRole = false;
            return ctx.reply('❌ Пользователь не найден. Используйте /start для регистрации.');
        }
        // Обновляем ctx.user для корректной работы профиля
        ctx.user = await User.findByTelegramId(ctx.from.id);
        const roleNames = {
            'customer': 'Заказчик',
            'manager': 'Менеджер',
            'executor': 'Исполнитель'
        };
        ctx.session.changingRole = false;
        await ctx.reply(
            `✅ <b>Роль успешно изменена!</b>\n\n` +
            `Ваша новая основная роль: <b>${roleNames[selectedRole]}</b>\n\n` +
            `Теперь вы можете использовать все функции, доступные для вашей роли.`,
            {
                parse_mode: 'HTML',
                reply_markup: profileKeyboard(selectedRole, ctx.user.telegram_id, ADMIN_ID).reply_markup
            }
        );
    } else {
        return next();
    }
});

// Обработка шагов создания проекта
bot.on('text', async (ctx, next) => {
    console.log('User text:', ctx.message.text);
    if (ctx.session?.createProject) {
        return handleCreateProjectStep(ctx);
    }
    
    // Обработка подтверждения удаления проекта
    if (ctx.session?.pendingDelete) {
        const handled = await handleDeleteConfirmation(ctx);
        if (handled) return;
    }
    
    // Обработка заполнения профиля менеджера
    if (ctx.session?.profileState || 
        ctx.session?.waitingForSalaryInput || 
        ctx.session?.waitingForContactsInput || 
        ctx.session?.waitingForAchievementsInput ||
        ctx.session?.waitingForSpecializationInput ||
        ctx.session?.waitingForSkillsInput) {
        return handleTextInput(ctx);
    }
    
    // Проверяем, есть ли активный чат по проекту
    const chatMatch = ctx.message.text.match(/^#chat_(\d+)/);
    if (chatMatch) {
        const projectId = chatMatch[1];
        if (!ctx.user) ctx.user = await User.findByTelegramId(ctx.from.id);
        const project = await Project.findById(projectId);
        if (!project) return ctx.reply('Проект не найден.');
        // Проверяем, есть ли активный чат
        const pm = await ProjectManager.findActiveChat(projectId, ctx.user.id);
        if (!pm) return ctx.reply('Чат не активен или вы не участник.');
        // Определяем собеседника
        let peerId;
        if (ctx.user.id === project.customer_id) peerId = pm.manager_id;
        else peerId = project.customer_id;
        const peer = await User.findById(peerId);
        if (!peer) return ctx.reply('Собеседник не найден.');
        // Сохраняем сообщение
        await ProjectMessage.create({ project_id: projectId, sender_id: ctx.user.id, text: ctx.message.text });
        // Пересылаем собеседнику
        await ctx.telegram.sendMessage(
            peer.telegram_id,
            `[Чат проекта ${project.name}]\n${ctx.user.first_name || ''}: ${ctx.message.text}\n(Для ответа напишите #chat_${projectId} и текст)`
        );
        await ctx.reply('Сообщение отправлено.');
        return;
    }
    
    return next();
});

// Обработка команд удаления проекта
bot.hears(/^\/delete_project_(\d+)$/, roleCheck(['customer']), deleteProject);

// Обработка отмены создания проекта
bot.command('cancel', async (ctx) => {
    if (ctx.session?.createProject) {
        delete ctx.session.createProject;
        await ctx.reply('❌ Создание проекта отменено.');
    } else {
        await ctx.reply('Нет активного процесса создания проекта.');
    }
});

// Обработка команд с параметрами
bot.command('project', async (ctx) => {
    const projectId = ctx.message.text.split(' ')[1];
    if (projectId) {
        ctx.params = [projectId];
        return projectDetails(ctx);
    }
    return ctx.reply('❌ Укажите ID проекта: /project [ID]');
});

bot.command('join', async (ctx) => {
    const projectId = ctx.message.text.split(' ')[1];
    if (projectId) {
        ctx.params = [projectId];
        return joinProject(ctx);
    }
    return ctx.reply('❌ Укажите ID проекта: /join [ID]');
});

// Команда передачи прав заказчика
bot.command('transfer_owner', customerOnly, async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    const [projectId, username] = args;
    if (!projectId || !username) {
        return ctx.reply('Использование: /transfer_owner [projectId] [username]');
    }
    // Проверка, что пользователь — владелец проекта
    const isOwner = await Project.isOwner(ctx.from.id, projectId);
    if (!isOwner) {
        return ctx.reply('❌ Вы не владелец этого проекта!');
    }
    try {
        await Project.transferOwnership(projectId, username);
        await ctx.reply(`✅ Права заказчика переданы @${username}`);
    } catch (error) {
        await ctx.reply(`❌ Ошибка: ${error.message}`);
    }
});

// Обработка inline callback запросов
bot.action(/project_members_(\d+)/, async (ctx) => {
    const projectId = ctx.match[1];
    // TODO: Реализовать просмотр участников проекта
    await ctx.answerCbQuery();
    await ctx.reply(`👥 <b>Участники проекта ${projectId}</b>\n\nФункция в разработке.`, { parse_mode: 'HTML' });
});

bot.action(/project_audit_(\d+)/, async (ctx) => {
    const projectId = ctx.match[1];
    // TODO: Реализовать просмотр аудита проекта
    await ctx.answerCbQuery();
    await ctx.reply(`📊 <b>Аудит проекта ${projectId}</b>\n\nФункция в разработке.`, { parse_mode: 'HTML' });
});

bot.action(/project_status_(\d+)/, async (ctx) => {
    const projectId = ctx.match[1];
    // TODO: Реализовать изменение статуса проекта
    await ctx.answerCbQuery();
    await ctx.reply(`📝 <b>Изменение статуса проекта ${projectId}</b>\n\nФункция в разработке.`, { parse_mode: 'HTML' });
});

// Обработка кнопки удаления проекта
bot.action(/project_delete_(\d+)/, async (ctx) => {
    const projectId = ctx.match[1];
    await ctx.answerCbQuery();
    
    // Создаем контекст для функции deleteProject
    const mockCtx = {
        user: ctx.user,
        from: ctx.from,
        message: { text: `/delete_project_${projectId}` },
        reply: ctx.reply.bind(ctx),
        session: ctx.session
    };
    
    await deleteProject(mockCtx);
});

bot.action(/join_project_(\d+)/, async (ctx) => {
    const projectId = ctx.match[1];
    // TODO: Реализовать подтверждение присоединения к проекту
    await ctx.answerCbQuery();
    await ctx.reply(`✅ <b>Присоединение к проекту ${projectId}</b>\n\nФункция в разработке.`, { parse_mode: 'HTML' });
});

bot.action(/reject_join_(\d+)/, async (ctx) => {
    const projectId = ctx.match[1];
    // TODO: Реализовать отклонение запроса на присоединение
    await ctx.answerCbQuery();
    await ctx.reply(`❌ <b>Отклонение запроса к проекту ${projectId}</b>\n\nФункция в разработке.`, { parse_mode: 'HTML' });
});

// Обработчики профиля менеджера
bot.action(/^spec_/, handleSpecialization);
bot.action(/^exp_/, handleExperience);
bot.action(/^skill_/, handleSkills);
bot.action('skills_done', handleSkillsDone);
bot.action('skills_clear', handleSkillsClear);
bot.action('profile_back', handleProfileBack);
bot.action('fill_achievements', handleFillAchievements);
bot.action('skip_optional', handleAchievements);
bot.action(/^salary_/, handleSalary);
bot.action(/^manager_/, handleManagerProfile);
bot.action('back_to_managers', handleBackToManagers);
bot.action('fill_salary', handleFillSalary);
bot.action('fill_contacts', handleFillContacts);

// Обработка кнопки '🔙 Назад'
bot.hears('🔙 Назад', roleCheck(), async (ctx) => {
    await ctx.reply(
        'Главное меню:',
        {
            reply_markup: getKeyboardByRole(ctx.user.main_role).reply_markup
        }
    );
});

// Обработка кнопки '🧹 Сбросить лимит'
bot.hears('🧹 Сбросить лимит', roleCheck(), async (ctx) => {
    if (String(ctx.user.telegram_id) !== String(ADMIN_ID)) {
        return ctx.reply('⛔ Эта функция доступна только администратору.');
    }
    
    // Показываем информацию о проектах пользователя
    const userProjects = await Project.findByCustomerId(ctx.user.id);
    const currentProjects = userProjects.length;
    const maxProjects = 2;
    
    let message = `📊 <b>Информация о проектах пользователя</b>\n\n`;
    message += `👤 Пользователь: @${ctx.user.username || ctx.user.first_name}\n`;
    message += `📋 Текущих проектов: ${currentProjects}/${maxProjects}\n`;
    
    if (currentProjects > 0) {
        message += `\n<b>Список проектов:</b>\n`;
        for (const project of userProjects) {
            message += `• ${project.name} (ID: ${project.id})\n`;
        }
    }
    
    if (currentProjects >= maxProjects) {
        message += `\n⚠️ Пользователь достиг лимита проектов.`;
    } else {
        message += `\n✅ Пользователь может создать еще ${maxProjects - currentProjects} проект(ов).`;
    }
    
    await ctx.reply(message, { parse_mode: 'HTML' });
});

// Обработка согласия менеджера на приглашение
bot.action(/^accept_invite_(\d+)$/, async (ctx) => {
    const projectId = ctx.match[1];
    if (!ctx.user) ctx.user = await User.findByTelegramId(ctx.from.id);
    const project = await Project.findById(projectId);
    if (!project) {
        await ctx.reply('Этот проект больше не существует или был удалён заказчиком.');
        return ctx.answerCbQuery();
    }
    // Находим запись project_managers
    const pm = await ProjectManager.findByProjectAndManager(projectId, ctx.user.id);
    if (!pm) {
        await ctx.reply('Приглашение не найдено или уже обработано.');
        return ctx.answerCbQuery();
    }
    // 1. Обновляем статус менеджера
    await ProjectManager.updateStatus(pm.id, 'accepted', pm.offer);
    // 1.1. Добавляем менеджера в project_members
    await Project.addMember(projectId, ctx.user.id, 'manager');
    // 2. Меняем статус проекта
    await Project.updateStatus(projectId, 'searching_executors');
    // 3. Уведомляем заказчика
    const customer = await User.findById(project.customer_id);
    if (customer) {
        await ctx.telegram.sendMessage(
            customer.telegram_id,
            `✅ Менеджер @${ctx.user.username || ''} принял ваш проект «${project.name}».`
        );
    }
    // 4. Логируем событие
    await AuditLog.create(
        ctx.user.id,
        'MANAGER_ACCEPTED',
        projectId,
        { managerUsername: ctx.user.username, projectName: project.name }
    );
    // 5. Обновляем карточку проекта
    ctx.params = [projectId];
    await projectDetails(ctx);
    await ctx.answerCbQuery();
});

// Обработка отказа менеджера
bot.action(/^decline_invite_(\d+)$/, async (ctx) => {
    const projectId = ctx.match[1];
    const project = await Project.findById(projectId);
    if (!project) {
        await ctx.reply('Этот проект больше не существует или был удалён заказчиком.');
        return ctx.answerCbQuery();
    }
    const managerTelegramId = ctx.from.id;
    const invitation = await ManagerInvitation.findPending(managerTelegramId, projectId);
    if (!invitation) {
        await ctx.reply('Приглашение не найдено или уже обработано.');
        return ctx.answerCbQuery();
    }
    await ManagerInvitation.updateStatus(invitation.id, 'declined');
    await ctx.reply('Вы отказались от приглашения.');
    // Уведомляем заказчика
    await ctx.telegram.sendMessage(
        invitation.customer_telegram_id,
        `Менеджер @${ctx.from.username || ''} отказался от приглашения в проект.`
    );
    await ctx.answerCbQuery();
});

// Обработка подробного просмотра проекта менеджером
bot.action(/^project_details_(\d+)$/, async (ctx) => {
    const projectId = ctx.match[1];
    const project = await Project.findById(projectId);
    if (!project) return ctx.reply('Проект не найден.');
    // Получаем заказчика
    const customer = await User.findById(project.customer_id);
    let msg = `<b>${project.name}</b>\n`;
    msg += `📝 <b>Описание:</b> ${project.description}\n`;
    msg += `👤 <b>Заказчик:</b> @${customer?.username || 'не указан'}\n`;
    msg += `🆔 <b>ID проекта:</b> ${project.id}\n`;
    msg += `📅 <b>Создан:</b> ${new Date(project.created_at).toLocaleDateString('ru-RU')}\n`;
    msg += `Бюджет: ${project.budget || 'не указан'}\n`;
    msg += `Срок: ${project.deadline || 'не указан'}\n`;
    msg += `\nТребования к менеджеру: ...\nУсловия работы: ...\nДоп. пожелания: ...\n`;
    await ctx.reply(msg, {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [
                    { text: 'Принять', callback_data: `project_accept_${project.id}` },
                    { text: 'Отклонить', callback_data: `project_decline_${project.id}` }
                ],
                [
                    { text: 'Предложить условия', callback_data: `project_offer_${project.id}` }
                ]
            ]
        }
    });
    await ctx.answerCbQuery();
});

// Менеджер принимает проект
bot.action(/^project_accept_(\d+)$/, async (ctx) => {
    const projectId = ctx.match[1];
    if (!ctx.user) ctx.user = await User.findByTelegramId(ctx.from.id);
    const project = await Project.findById(projectId);
    if (!project) return ctx.reply('Проект не найден.');
    // Проверяем, не откликался ли уже
    const existing = await ProjectManager.findByProjectAndManager(projectId, ctx.user.id);
    if (existing) return ctx.reply('Вы уже откликались на этот проект.');
    await ProjectManager.create({ project_id: projectId, manager_id: ctx.user.id, status: 'accepted' });
    // Уведомляем заказчика
    const customer = await User.findById(project.customer_id);
    if (customer) {
        await ctx.telegram.sendMessage(
            customer.telegram_id,
            `Менеджер @${ctx.user.username || ''} принял ваш проект "${project.name}"!`
        );
    }
    await ctx.reply('Вы приняли проект! Заказчик уведомлён.');
    await ctx.answerCbQuery();
});

// Менеджер отклоняет проект
bot.action(/^project_decline_(\d+)$/, async (ctx) => {
    const projectId = ctx.match[1];
    if (!ctx.user) ctx.user = await User.findByTelegramId(ctx.from.id);
    const project = await Project.findById(projectId);
    if (!project) return ctx.reply('Проект не найден.');
    const existing = await ProjectManager.findByProjectAndManager(projectId, ctx.user.id);
    if (existing) return ctx.reply('Вы уже откликались на этот проект.');
    await ProjectManager.create({ project_id: projectId, manager_id: ctx.user.id, status: 'declined' });
    await ctx.reply('Вы отклонили проект.');
    await ctx.answerCbQuery();
});

// Менеджер предлагает условия
bot.action(/^project_offer_(\d+)$/, async (ctx) => {
    const projectId = ctx.match[1];
    const project = await Project.findById(projectId);
    if (!project) {
        await ctx.reply('Этот проект больше не существует или был удалён заказчиком.');
        return ctx.answerCbQuery();
    }
    ctx.session = ctx.session || {};
    ctx.session.projectOffer = { projectId };
    await ctx.reply('Введите ваши условия/предложение для заказчика (например: "Готов за 40 тыс., срок 3 недели"):');
    await ctx.answerCbQuery();
});

// Заказчик получает предложение менеджера и может принять, отклонить, обсудить
bot.on('callback_query', async (ctx, next) => {
    if (ctx.callbackQuery.data.startsWith('customer_offer_action_')) {
        const parts = ctx.callbackQuery.data.split('_');
        const action = parts[3];
        const projectId = parts[4];
        const managerId = parts[5];
        const project = await Project.findById(projectId);
        const manager = await User.findById(managerId);
        if (!project || !manager) return ctx.reply('Проект или менеджер не найден.');
        const pm = await ProjectManager.findByProjectAndManager(projectId, managerId);
        if (!pm) return ctx.reply('Отклик не найден.');
        if (action === 'accept') {
            await ProjectManager.updateStatus(pm.id, 'accepted', pm.offer);
            await ProjectManager.activateChat(pm.id);
            await ctx.telegram.sendMessage(manager.telegram_id, `Ваше предложение по проекту "${project.name}" принято! Открыт чат с заказчиком.`);
            await ctx.reply('Вы приняли предложение менеджера. Открыт чат.');
        } else if (action === 'decline') {
            await ProjectManager.updateStatus(pm.id, 'declined', pm.offer);
            await ctx.telegram.sendMessage(manager.telegram_id, `Ваше предложение по проекту "${project.name}" отклонено.`);
            await ctx.reply('Вы отклонили предложение менеджера.');
        } else if (action === 'discuss') {
            await ctx.telegram.sendMessage(manager.telegram_id, `Заказчик хочет обсудить детали по проекту "${project.name}". Напишите ему в чате.`);
            await ctx.reply('Вы выбрали обсуждение. Откройте чат для переписки.', {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: 'Открыть чат', callback_data: `open_chat_${project.id}` }
                        ]
                    ]
                }
            });
        }
        await ctx.answerCbQuery();
        return;
    }
    return next();
});

// Когда заказчик получает предложение — отправляем ему кнопки
async function notifyCustomerOffer(customer, manager, project, offer) {
    await bot.telegram.sendMessage(
        customer.telegram_id,
        `Менеджер @${manager.username || ''} предложил условия по проекту "${project.name}":\n${offer}`,
        {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: 'Принять', callback_data: `customer_offer_action_accept_${project.id}_${manager.id}` },
                        { text: 'Отклонить', callback_data: `customer_offer_action_decline_${project.id}_${manager.id}` }
                    ],
                    [
                        { text: 'Обсудить', callback_data: `customer_offer_action_discuss_${project.id}_${manager.id}` }
                    ]
                ]
            }
        }
    );
}

// Модифицирую обработку предложения условий менеджером, чтобы вызывать notifyCustomerOffer
bot.on('text', async (ctx, next) => {
    if (ctx.session?.projectOffer) {
        const { projectId } = ctx.session.projectOffer;
        if (!ctx.user) ctx.user = await User.findByTelegramId(ctx.from.id);
        const project = await Project.findById(projectId);
        if (!project) return ctx.reply('Проект не найден.');
        const existing = await ProjectManager.findByProjectAndManager(projectId, ctx.user.id);
        if (existing) return ctx.reply('Вы уже откликались на этот проект.');
        await ProjectManager.create({ project_id: projectId, manager_id: ctx.user.id, status: 'negotiating', offer: ctx.message.text });
        // Уведомляем заказчика с кнопками
        const customer = await User.findById(project.customer_id);
        if (customer) {
            await notifyCustomerOffer(customer, ctx.user, project, ctx.message.text);
        }
        await ctx.reply('Ваше предложение отправлено заказчику.');
        delete ctx.session.projectOffer;
        return;
    }
    return next();
});

// Обработка неизвестных команд
bot.on('message', async (ctx, next) => {
    console.log('Raw message:', ctx.message.text);
    if (ctx.message.handled) return next();
    
    if (ctx.message.text && !ctx.message.text.startsWith('/')) {
        await ctx.reply('❓ Неизвестная команда...');
    }
    return next();
});

// Команда для просмотра истории чата проекта
bot.command(/history_(\d+)/, async (ctx) => {
    const projectId = ctx.match[1];
    if (!ctx.user) ctx.user = await User.findByTelegramId(ctx.from.id);
    const project = await Project.findById(projectId);
    if (!project) return ctx.reply('Проект не найден.');
    // Проверяем, есть ли активный чат и доступ
    const pm = await ProjectManager.findActiveChat(projectId, ctx.user.id);
    if (!pm) return ctx.reply('Чат не активен или вы не участник.');
    const messages = await ProjectMessage.findByProject(projectId);
    if (!messages.length) return ctx.reply('История чата пуста.');
    let history = `<b>История чата проекта ${project.name}:</b>\n\n`;
    for (const msg of messages) {
        const sender = await User.findById(msg.sender_id);
        if (msg.attachment_url) {
            history += `<b>${sender?.first_name || 'Пользователь'}:</b> [файл] <code>${msg.attachment_url}</code> ${msg.text ? '— ' + msg.text : ''}\n`;
        } else {
            history += `<b>${sender?.first_name || 'Пользователь'}:</b> ${msg.text}\n`;
        }
    }
    await ctx.reply(history, { parse_mode: 'HTML' });
});

// Обработка файлов с поддержкой чата проекта
bot.on(['document', 'photo', 'audio', 'video'], async (ctx, next) => {
    let caption = ctx.message.caption || '';
    const chatMatch = caption.match(/^#chat_(\d+)/);
    if (!chatMatch) return next();
    const projectId = chatMatch[1];
    if (!ctx.user) ctx.user = await User.findByTelegramId(ctx.from.id);
    const project = await Project.findById(projectId);
    if (!project) return ctx.reply('Проект не найден.');
    const pm = await ProjectManager.findActiveChat(projectId, ctx.user.id);
    if (!pm) return ctx.reply('Чат не активен или вы не участник.');
    // Определяем собеседника
    let peerId;
    if (ctx.user.id === project.customer_id) peerId = pm.manager_id;
    else peerId = project.customer_id;
    const peer = await User.findById(peerId);
    if (!peer) return ctx.reply('Собеседник не найден.');
    // Определяем file_id и тип
    let file_id = null, file_type = null;
    if (ctx.message.document) {
        file_id = ctx.message.document.file_id;
        file_type = 'document';
    } else if (ctx.message.photo) {
        file_id = ctx.message.photo[ctx.message.photo.length-1].file_id;
        file_type = 'photo';
    } else if (ctx.message.audio) {
        file_id = ctx.message.audio.file_id;
        file_type = 'audio';
    } else if (ctx.message.video) {
        file_id = ctx.message.video.file_id;
        file_type = 'video';
    }
    // Сохраняем сообщение
    await ProjectMessage.create({ project_id: projectId, sender_id: ctx.user.id, text: caption, attachment_url: file_id });
    // Пересылаем файл собеседнику
    if (file_type === 'document') {
        await ctx.telegram.sendDocument(peer.telegram_id, file_id, { caption: `[Чат проекта ${project.name}]\n${ctx.user.first_name || ''}: ${caption}\n(Для ответа напишите #chat_${projectId} и текст)` });
    } else if (file_type === 'photo') {
        await ctx.telegram.sendPhoto(peer.telegram_id, file_id, { caption: `[Чат проекта ${project.name}]\n${ctx.user.first_name || ''}: ${caption}\n(Для ответа напишите #chat_${projectId} и текст)` });
    } else if (file_type === 'audio') {
        await ctx.telegram.sendAudio(peer.telegram_id, file_id, { caption: `[Чат проекта ${project.name}]\n${ctx.user.first_name || ''}: ${caption}\n(Для ответа напишите #chat_${projectId} и текст)` });
    } else if (file_type === 'video') {
        await ctx.telegram.sendVideo(peer.telegram_id, file_id, { caption: `[Чат проекта ${project.name}]\n${ctx.user.first_name || ''}: ${caption}\n(Для ответа напишите #chat_${projectId} и текст)` });
    }
    await ctx.reply('Файл отправлен.');
});

// Обработка кнопки "Открыть чат"
bot.action(/^open_chat_(\d+)$/, async (ctx) => {
    const projectId = ctx.match[1];
    ctx.session = ctx.session || {};
    ctx.session.activeChatProjectId = projectId;
    await ctx.reply(`Чат по проекту №${projectId} активирован!\n\nТеперь просто отправляйте сообщения или файлы — они будут доставлены вашему собеседнику по проекту.\n\nДля выхода из чата напишите /stopchat.\nДля просмотра истории чата: /history_${projectId}`);
    await ctx.answerCbQuery();
});

// Перехват текстовых сообщений в режиме чата
bot.on('text', async (ctx, next) => {
    if (ctx.session?.activeChatProjectId) {
        const projectId = ctx.session.activeChatProjectId;
        if (!ctx.user) ctx.user = await User.findByTelegramId(ctx.from.id);
        const project = await Project.findById(projectId);
        if (!project) return ctx.reply('Проект не найден.');
        const pm = await ProjectManager.findActiveChat(projectId, ctx.user.id);
        if (!pm) return ctx.reply('Чат не активен или вы не участник.');
        // Определяем собеседника
        let peerId;
        if (ctx.user.id === project.customer_id) peerId = pm.manager_id;
        else peerId = project.customer_id;
        const peer = await User.findById(peerId);
        if (!peer) return ctx.reply('Собеседник не найден.');
        // Сохраняем и пересылаем сообщение
        await ProjectMessage.create({ project_id: projectId, sender_id: ctx.user.id, text: ctx.message.text });
        await ctx.telegram.sendMessage(peer.telegram_id, `[Чат проекта ${project.name}]\n${ctx.user.first_name || ''}: ${ctx.message.text}\n(Для ответа просто напишите сообщение — оно будет доставлено собеседнику)`);
        await ctx.reply('Сообщение отправлено в чат проекта.');
        return;
    }
    return next();
});

// Перехват файлов в режиме чата
bot.on(['document', 'photo', 'audio', 'video'], async (ctx, next) => {
    if (ctx.session?.activeChatProjectId) {
        const projectId = ctx.session.activeChatProjectId;
        if (!ctx.user) ctx.user = await User.findByTelegramId(ctx.from.id);
        const project = await Project.findById(projectId);
        if (!project) return ctx.reply('Проект не найден.');
        const pm = await ProjectManager.findActiveChat(projectId, ctx.user.id);
        if (!pm) return ctx.reply('Чат не активен или вы не участник.');
        // Определяем собеседника
        let peerId;
        if (ctx.user.id === project.customer_id) peerId = pm.manager_id;
        else peerId = project.customer_id;
        const peer = await User.findById(peerId);
        if (!peer) return ctx.reply('Собеседник не найден.');
        // Определяем file_id и тип
        let file_id = null, file_type = null;
        if (ctx.message.document) {
            file_id = ctx.message.document.file_id;
            file_type = 'document';
        } else if (ctx.message.photo) {
            file_id = ctx.message.photo[ctx.message.photo.length-1].file_id;
            file_type = 'photo';
        } else if (ctx.message.audio) {
            file_id = ctx.message.audio.file_id;
            file_type = 'audio';
        } else if (ctx.message.video) {
            file_id = ctx.message.video.file_id;
            file_type = 'video';
        }
        // Сохраняем сообщение
        await ProjectMessage.create({ project_id: projectId, sender_id: ctx.user.id, text: ctx.message.caption || '', attachment_url: file_id });
        // Пересылаем файл собеседнику
        if (file_type === 'document') {
            await ctx.telegram.sendDocument(peer.telegram_id, file_id, { caption: `[Чат проекта ${project.name}]\n${ctx.user.first_name || ''}: ${ctx.message.caption || ''}\n(Для ответа просто отправьте файл или сообщение)` });
        } else if (file_type === 'photo') {
            await ctx.telegram.sendPhoto(peer.telegram_id, file_id, { caption: `[Чат проекта ${project.name}]\n${ctx.user.first_name || ''}: ${ctx.message.caption || ''}\n(Для ответа просто отправьте файл или сообщение)` });
        } else if (file_type === 'audio') {
            await ctx.telegram.sendAudio(peer.telegram_id, file_id, { caption: `[Чат проекта ${project.name}]\n${ctx.user.first_name || ''}: ${ctx.message.caption || ''}\n(Для ответа просто отправьте файл или сообщение)` });
        } else if (file_type === 'video') {
            await ctx.telegram.sendVideo(peer.telegram_id, file_id, { caption: `[Чат проекта ${project.name}]\n${ctx.user.first_name || ''}: ${ctx.message.caption || ''}\n(Для ответа просто отправьте файл или сообщение)` });
        }
        await ctx.reply('Файл отправлен в чат проекта.');
        return;
    }
    return next();
});

// Команда для выхода из чата
bot.command('stopchat', async (ctx) => {
    if (ctx.session?.activeChatProjectId) {
        delete ctx.session.activeChatProjectId;
        await ctx.reply('Вы вышли из чата проекта.');
    } else {
        await ctx.reply('У вас нет активного чата.');
    }
});

// Запуск бота
const startBot = async () => {
    try {
        console.log('🚀 Starting Telegram bot...');
        await bot.launch();
        console.log('✅ Bot started successfully!');
        
        // Graceful stop
        process.once('SIGINT', () => bot.stop('SIGINT'));
        process.once('SIGTERM', () => bot.stop('SIGTERM'));
        
    } catch (error) {
        console.error('❌ Error starting bot:', error);
        process.exit(1);
    }
};

// Запуск бота если файл запущен напрямую
if (require.main === module) {
    startBot();
}

module.exports = { bot, startBot }; 