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
    handleDeleteConfirmation,
    performProjectDeletion,
    projectPreview,
    // Добавьте другие функции по необходимости
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
    handleFillContacts,
    showEditProfileMenu,
    showEditFieldList,
    handleEditFieldInput,
    handleEditFieldValue
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
bot.hears(['📝 Заполнить профиль', '✏️ Редактировать профиль'], managerOnly, async (ctx) => {
    await showEditProfileMenu(ctx);
});
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
        `👤 <b>Вы - ${roleNames[ctx.user.main_role] || ctx.user.main_role}</b>\n\n` +
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
        
        // Логируем изменение роли
        await AuditLog.create(
            ctx.from.id,
            'ROLE_CHANGE',
            null,
            { 
                oldRole: ctx.user?.main_role || 'unknown', 
                newRole: selectedRole,
                username: user.username 
            }
        );
        
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
    
    if (ctx.session?.editProfileMode === 'one_field' && !ctx.session.editProfileField) {
        // Ожидаем номер поля
        const user = await User.findByTelegramId(ctx.from.id);
        return handleEditFieldInput(ctx, user);
    }
    if (ctx.session?.editProfileMode === 'one_field' && ctx.session.editProfileField) {
        // Ожидаем новое значение
        const user = await User.findByTelegramId(ctx.from.id);
        await handleEditFieldValue(ctx, user);
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
        await ctx.answerCbQuery('❌ Проект не найден или был удалён заказчиком.');
        return;
    }
    
    // Находим запись project_managers
    const pm = await ProjectManager.findByProjectAndManager(projectId, ctx.user.id);
    if (!pm) {
        await ctx.answerCbQuery('❌ Приглашение не найдено или уже обработано.');
        return;
    }
    
    // Проверяем, что менеджер еще не принят
    if (pm.status === 'accepted') {
        await ctx.answerCbQuery('✅ Вы уже приняли это приглашение!');
        return;
    }
    
    // Проверяем, что менеджер не отказался
    if (pm.status === 'declined') {
        await ctx.answerCbQuery('❌ Вы уже отказались от этого приглашения.');
        return;
    }
    
    try {
        // 1. Обновляем статус менеджера
        await ProjectManager.updateStatus(pm.id, 'accepted', pm.offer);
        
        // 2. Добавляем менеджера в project_members (с проверкой на дубликаты)
        const hasMember = await Project.hasMember(projectId, ctx.user.id, 'manager');
        
        if (!hasMember) {
            await Project.addMember(projectId, ctx.user.id, 'manager');
        }
        
        // 3. Меняем статус проекта
        await Project.updateStatus(projectId, 'searching_executors');
        
        // 4. Уведомляем заказчика
        const customer = await User.findById(project.customer_id);
        if (customer) {
            await ctx.telegram.sendMessage(
                customer.telegram_id,
                `✅ Менеджер @${ctx.user.username || ''} принял ваш проект «${project.name}».`
            );
        }
        
        // 5. Логируем событие
        await AuditLog.create(
            ctx.user.id,
            'MANAGER_ACCEPTED',
            projectId,
            { managerUsername: ctx.user.username, projectName: project.name }
        );
        
        // 6. Обновляем карточку проекта
        ctx.params = [projectId];
        await projectDetails(ctx);
        
        await ctx.answerCbQuery('✅ Приглашение принято!');
        
    } catch (error) {
        console.error('Error in accept_invite:', error);
        await ctx.answerCbQuery('❌ Произошла ошибка при принятии приглашения.');
    }
});

// Обработка отказа менеджера
bot.action(/^decline_invite_(\d+)$/, async (ctx) => {
    try {
        console.log('[decline_invite] Начало обработки отказа для проекта:', ctx.match[1]);
        console.log('[decline_invite] Пользователь:', ctx.from?.id, ctx.from?.username);
        
        const projectId = ctx.match[1];
        
        // Получаем пользователя
        if (!ctx.user) {
            ctx.user = await User.findByTelegramId(ctx.from.id);
            if (!ctx.user) {
                await ctx.answerCbQuery('❌ Пользователь не найден. Используйте /start для регистрации.');
                return;
            }
        }
        
        // Получаем проект
        const project = await Project.findById(projectId);
        if (!project) {
            await ctx.answerCbQuery('❌ Проект не найден или был удалён заказчиком.');
            return;
        }
        
        console.log('[decline_invite] Проект найден:', project.name);
        
        // Проверяем, что пользователь не является заказчиком
        if (project.customer_id === ctx.user.id) {
            console.log('[decline_invite] Заказчик не может отказаться от своего проекта');
            await ctx.answerCbQuery('❌ Заказчик не может отказаться от своего проекта.');
            return;
        }
        
        // Находим запись project_managers (приглашение)
        const pm = await ProjectManager.findByProjectAndManager(projectId, ctx.user.id);
        
        // Проверяем, является ли пользователь участником проекта
        const projectMember = await Project.hasMember(projectId, ctx.user.id);
        
        // Определяем тип отказа
        let declineType = 'none';
        let userRole = 'unknown';
        
        if (pm) {
            // Пользователь имеет приглашение в project_managers
            if (pm.status === 'declined') {
                await ctx.answerCbQuery('❌ Вы уже отказались от этого приглашения.');
                return;
            }
            
            if (pm.status === 'pending') {
                declineType = 'invitation';
                userRole = 'manager';
                console.log('[decline_invite] Отказ от приглашения (pending)');
            } else if (pm.status === 'accepted') {
                declineType = 'accepted_manager';
                userRole = 'manager';
                console.log('[decline_invite] Отказ принятого менеджера (accepted)');
            }
        } else if (projectMember) {
            // Пользователь является участником проекта (но не в project_managers)
            const members = await Project.getMembers(projectId);
            const userMember = members.find(m => m.id === ctx.user.id);
            if (userMember) {
                declineType = 'project_member';
                userRole = userMember.member_role;
                console.log('[decline_invite] Отказ участника проекта:', userRole);
            }
        }
        
        if (declineType === 'none') {
            console.log('[decline_invite] Пользователь не имеет доступа к проекту');
            await ctx.answerCbQuery('❌ Вы не являетесь участником этого проекта.');
            return;
        }
        
        // Обрабатываем отказ в зависимости от типа
        if (declineType === 'invitation') {
            // Отказ от приглашения - обновляем статус на declined
            console.log('[decline_invite] Обновляем статус приглашения на declined');
            await ProjectManager.updateStatus(pm.id, 'declined');
            
        } else if (declineType === 'accepted_manager') {
            // Отказ принятого менеджера - удаляем из project_members и project_managers
            console.log('[decline_invite] Удаляем принятого менеджера');
            await Project.removeMember(projectId, ctx.user.id);
            await ProjectManager.deleteByProjectAndManager(projectId, ctx.user.id);
            
        } else if (declineType === 'project_member') {
            // Отказ участника проекта - удаляем из project_members
            console.log('[decline_invite] Удаляем участника проекта');
            await Project.removeMember(projectId, ctx.user.id);
        }
        
        // Проверяем, есть ли еще менеджеры в проекте
        const remainingManagers = await ProjectManager.findByProject(projectId);
        const acceptedManagers = remainingManagers.filter(m => m.status === 'accepted');
        
        console.log('[decline_invite] Оставшиеся менеджеры:', acceptedManagers.length);
        
        // Если нет принятых менеджеров, возвращаем проект к заказчику
        if (acceptedManagers.length === 0) {
            console.log('[decline_invite] Нет менеджеров, возвращаем проект заказчику');
            
            // Добавляем заказчика как менеджера
            await Project.addMember(projectId, project.customer_id, 'manager');
            await ProjectManager.create({ 
                project_id: projectId, 
                manager_id: project.customer_id, 
                status: 'accepted' 
            });
            
            // Меняем статус проекта на 'searching_executors'
            await Project.updateStatus(projectId, 'searching_executors');
        }
        
        // Уведомляем заказчика
        const customer = await User.findById(project.customer_id);
        if (customer) {
            let message;
            if (declineType === 'invitation') {
                message = `❌ Менеджер @${ctx.user.username || 'пользователь'} отказался от приглашения в проект «${project.name}».`;
            } else {
                const roleText = userRole === 'manager' ? 'менеджер' : 'исполнитель';
                message = `❌ ${roleText.charAt(0).toUpperCase() + roleText.slice(1)} @${ctx.user.username || 'пользователь'} отказался от участия в проекте «${project.name}».`;
            }
            
            console.log('[decline_invite] Отправляем уведомление заказчику:', customer.telegram_id);
            await ctx.telegram.sendMessage(customer.telegram_id, message);
        }
        
        // Логируем событие
        await AuditLog.create(
            ctx.user.id,
            'PROJECT_DECLINED',
            projectId,
            { 
                username: ctx.user.username, 
                projectName: project.name,
                role: userRole,
                declineType: declineType
            }
        );
        
        console.log('[decline_invite] Отказ обработан успешно');
        
        // Отвечаем пользователю в зависимости от типа отказа
        let responseMessage;
        if (declineType === 'invitation') {
            responseMessage = '❌ Вы отказались от приглашения.';
        } else {
            responseMessage = '❌ Вы отказались от участия в проекте.';
        }
        
        await ctx.answerCbQuery(responseMessage);
        
        // Обновляем карточку проекта (если это возможно)
        try {
            ctx.params = [projectId];
            await projectDetails(ctx);
        } catch (error) {
            console.log('[decline_invite] Ошибка при обновлении карточки проекта:', error.message);
        }
        
    } catch (error) {
        console.error('[decline_invite] Ошибка при обработке отказа:', error);
        await ctx.answerCbQuery('❌ Произошла ошибка при отказе от проекта.');
    }
});

// Обработка подробного просмотра проекта
bot.action(/^project_details_(\d+)$/, async (ctx) => {
    console.log('=== PROJECT DETAILS ACTION TRIGGERED ===');
    console.log('User:', ctx.user?.id, ctx.user?.username);
    console.log('Match:', ctx.match);
    
    const projectId = ctx.match[1];
    console.log('=== PROJECT DETAILS ACTION ===');
    console.log('Project ID from action:', projectId);
    
    // Создаем контекст для функции projectDetails
    ctx.params = [projectId];
    
    try {
        await projectDetails(ctx);
    } catch (error) {
        console.error('Error in project_details action:', error);
        await ctx.reply('❌ Произошла ошибка при загрузке проекта.');
    }
    
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

// Заказчик назначает менеджера
bot.action(/^assign_manager_(\d+)$/, async (ctx) => {
    const projectId = ctx.match[1];
    if (!ctx.user) ctx.user = await User.findByTelegramId(ctx.from.id);
    const project = await Project.findById(projectId);
    if (!project) return ctx.reply('Проект не найден.');
    
    // Проверяем права доступа
    if (project.customer_id !== ctx.user.id) {
        return ctx.reply('❌ У вас нет прав для управления этим проектом.');
    }
    
    // Проверяем статус проекта
    const allowedStatuses = ['active', 'searching_executors'];
    if (!allowedStatuses.includes(project.status)) {
        const statusNames = {
            'draft': 'черновик',
            'archived': 'архив',
            'searching_manager': 'поиск менеджера',
            'in_progress': 'в работе'
        };
        const statusName = statusNames[project.status] || project.status;
        await ctx.reply(`❌ Управление менеджерами недоступно для проектов в статусе "${statusName}".\n\nКнопки управления менеджерами отображаются только для проектов в статусе "Активный" или "Поиск исполнителей".`);
        return ctx.answerCbQuery();
    }
    
    // Показываем список доступных менеджеров
    const managers = await User.findVisibleByRole('manager');
    if (!managers || managers.length === 0) {
        await ctx.reply('❌ В системе пока нет доступных менеджеров с открытым профилем.');
        return ctx.answerCbQuery();
    }
    
    // Исключаем заказчика из списка
    const availableManagers = managers.filter(m => m.id !== ctx.user.id);
    if (availableManagers.length === 0) {
        await ctx.reply('❌ Нет других менеджеров, кроме вас.');
        return ctx.answerCbQuery();
    }
    
    let list = '👨‍💼 <b>Выберите менеджера:</b>\n\n';
    for (const m of availableManagers) {
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
    
    // Создаем кнопки для каждого менеджера
    const buttons = availableManagers.map(m => [{
        text: `@${m.username}`,
        callback_data: `select_manager_${projectId}_${m.id}`
    }]);
    
    await ctx.reply(list, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons }
    });
    await ctx.answerCbQuery();
});

// Заказчик выбирает конкретного менеджера
bot.action(/^select_manager_(\d+)_(\d+)$/, async (ctx) => {
    const projectId = ctx.match[1];
    const managerId = ctx.match[2];
    if (!ctx.user) ctx.user = await User.findByTelegramId(ctx.from.id);
    
    const project = await Project.findById(projectId);
    const manager = await User.findById(managerId);
    if (!project || !manager) {
        await ctx.reply('❌ Проект или менеджер не найден.');
        return ctx.answerCbQuery();
    }
    
    // Проверяем права доступа
    if (project.customer_id !== ctx.user.id) {
        await ctx.reply('❌ У вас нет прав для управления этим проектом.');
        return ctx.answerCbQuery();
    }
    
    // Проверяем, что выбранный пользователь все еще является менеджером
    if (manager.main_role !== 'manager') {
        await ctx.reply(
            `⚠️ Пользователь @${manager.username} больше не является менеджером.\n\n` +
            `Выберите другого кандидата из списка.`
        );
        return ctx.answerCbQuery();
    }
    
    // Проверяем, что менеджер все еще видимый
    if (!manager.is_visible) {
        await ctx.reply(
            `⚠️ Пользователь @${manager.username} больше не доступен для назначения.\n\n` +
            `Выберите другого кандидата из списка.`
        );
        return ctx.answerCbQuery();
    }
    
    try {
        // Удаляем заказчика из роли менеджера
        await ProjectManager.deleteByProjectAndManager(projectId, ctx.user.id);
        await Project.removeUserFromProjectRoles(ctx.user.id, projectId, 'manager');
        
        // Добавляем нового менеджера
        await Project.addUserToProjectRoles(managerId, projectId, 'manager');
        await ProjectManager.create({ project_id: projectId, manager_id: managerId, status: 'pending' });
        
        // Отправляем уведомление менеджеру
        await ctx.telegram.sendMessage(
            manager.telegram_id,
            `Вас назначили менеджером проекта "${project.name}" от ${ctx.user.first_name} ${ctx.user.last_name || ''}`,
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
        
        await ctx.reply(`✅ Менеджер @${manager.username} назначен и уведомлен!`);
        
    } catch (error) {
        console.error('Error in select_manager:', error);
        await ctx.reply('❌ Произошла ошибка при назначении менеджера. Попробуйте еще раз.');
    }
    
    await ctx.answerCbQuery();
});

// Заказчик убирает менеджера
bot.action(/^remove_manager_(\d+)$/, async (ctx) => {
    const projectId = ctx.match[1];
    if (!ctx.user) ctx.user = await User.findByTelegramId(ctx.from.id);
    const project = await Project.findById(projectId);
    if (!project) return ctx.reply('Проект не найден.');
    
    // Проверяем права доступа
    if (project.customer_id !== ctx.user.id) {
        return ctx.reply('❌ У вас нет прав для управления этим проектом.');
    }
    
    // Получаем всех менеджеров проекта
    const managers = await ProjectManager.findByProject(projectId);
    const acceptedManagers = managers.filter(m => m.status === 'accepted');
    
    if (acceptedManagers.length === 0) {
        await ctx.reply('❌ В проекте нет принятых менеджеров для удаления.');
        return ctx.answerCbQuery();
    }
    
    // Показываем список менеджеров для удаления
    let list = '❌ <b>Выберите менеджера для удаления:</b>\n\n';
    const buttons = [];
    
    for (const m of acceptedManagers) {
        const user = await User.findById(m.manager_id);
        if (user) {
            list += `• @${user.username} — ${user.first_name || ''} ${user.last_name || ''}\n`;
            buttons.push([{
                text: `Удалить @${user.username}`,
                callback_data: `confirm_remove_manager_${projectId}_${m.manager_id}`
            }]);
        }
    }
    
    await ctx.reply(list, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons }
    });
    await ctx.answerCbQuery();
});

// Заказчик подтверждает удаление менеджера
bot.action(/^confirm_remove_manager_(\d+)_(\d+)$/, async (ctx) => {
    const projectId = ctx.match[1];
    const managerId = ctx.match[2];
    if (!ctx.user) ctx.user = await User.findByTelegramId(ctx.from.id);
    
    const project = await Project.findById(projectId);
    const manager = await User.findById(managerId);
    if (!project || !manager) return ctx.reply('Проект или менеджер не найден.');
    
    // Проверяем права доступа
    if (project.customer_id !== ctx.user.id) {
        return ctx.reply('❌ У вас нет прав для управления этим проектом.');
    }
    
    // Получаем всех менеджеров проекта
    const allManagers = await ProjectManager.findByProject(projectId);
    const acceptedManagers = allManagers.filter(m => m.status === 'accepted');
    
    // Удаляем менеджера
    await ProjectManager.deleteByProjectAndManager(projectId, managerId);
    await Project.removeUserFromProjectRoles(managerId, projectId, 'manager');
    
    // Уведомляем менеджера
    await ctx.telegram.sendMessage(
        manager.telegram_id,
        `Вас удалили из проекта "${project.name}"`
    );
    
    let responseMessage = `✅ Менеджер @${manager.username} удален из проекта!`;
    
    // Если это был единственный принятый менеджер, автоматически назначаем заказчика
    if (acceptedManagers.length === 1) {
        // Добавляем заказчика как менеджера
        await Project.addUserToProjectRoles(ctx.user.id, projectId, 'manager');
        await ProjectManager.create({ 
            project_id: projectId, 
            manager_id: ctx.user.id, 
            status: 'accepted' 
        });
        
        responseMessage += '\n\n👨‍💼 <b>Внимание!</b> Поскольку это был единственный менеджер, вы автоматически назначены менеджером проекта.';
    }
    
    await ctx.reply(responseMessage, { parse_mode: 'HTML' });
    await ctx.answerCbQuery();
});

// Заказчик добавляет дополнительного менеджера
bot.action(/^add_manager_(\d+)$/, async (ctx) => {
    const projectId = ctx.match[1];
    if (!ctx.user) ctx.user = await User.findByTelegramId(ctx.from.id);
    const project = await Project.findById(projectId);
    if (!project) return ctx.reply('Проект не найден.');
    
    // Проверяем права доступа
    if (project.customer_id !== ctx.user.id) {
        return ctx.reply('❌ У вас нет прав для управления этим проектом.');
    }
    
    // Проверяем статус проекта
    const allowedStatuses = ['active', 'searching_executors'];
    if (!allowedStatuses.includes(project.status)) {
        const statusNames = {
            'draft': 'черновик',
            'archived': 'архив',
            'searching_manager': 'поиск менеджера',
            'in_progress': 'в работе'
        };
        const statusName = statusNames[project.status] || project.status;
        await ctx.reply(`❌ Управление менеджерами недоступно для проектов в статусе "${statusName}".\n\nКнопки управления менеджерами отображаются только для проектов в статусе "Активный" или "Поиск исполнителей".`);
        return ctx.answerCbQuery();
    }
    
    // Показываем список доступных менеджеров
    const managers = await User.findVisibleByRole('manager');
    if (!managers || managers.length === 0) {
        await ctx.reply('❌ В системе пока нет доступных менеджеров с открытым профилем.');
        return ctx.answerCbQuery();
    }
    
    // Исключаем заказчика и уже добавленных менеджеров
    const existingManagers = await ProjectManager.findByProject(projectId);
    const existingManagerIds = existingManagers.map(m => m.manager_id);
    const availableManagers = managers.filter(m => 
        m.id !== ctx.user.id && !existingManagerIds.includes(m.id)
    );
    
    if (availableManagers.length === 0) {
        await ctx.reply('❌ Нет доступных менеджеров для добавления.');
        return ctx.answerCbQuery();
    }
    
    let list = '➕ <b>Выберите дополнительного менеджера:</b>\n\n';
    for (const m of availableManagers) {
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
    
    // Создаем кнопки для каждого менеджера
    const buttons = availableManagers.map(m => [{
        text: `@${m.username}`,
        callback_data: `add_manager_select_${projectId}_${m.id}`
    }]);
    
    await ctx.reply(list, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons }
    });
    await ctx.answerCbQuery();
});

// Заказчик выбирает дополнительного менеджера
bot.action(/^add_manager_select_(\d+)_(\d+)$/, async (ctx) => {
    const projectId = ctx.match[1];
    const managerId = ctx.match[2];
    if (!ctx.user) ctx.user = await User.findByTelegramId(ctx.from.id);
    
    const project = await Project.findById(projectId);
    const manager = await User.findById(managerId);
    if (!project || !manager) {
        await ctx.reply('❌ Проект или менеджер не найден.');
        return ctx.answerCbQuery();
    }
    
    // Проверяем права доступа
    if (project.customer_id !== ctx.user.id) {
        await ctx.reply('❌ У вас нет прав для управления этим проектом.');
        return ctx.answerCbQuery();
    }
    
    // Проверяем, что выбранный пользователь все еще является менеджером
    if (manager.main_role !== 'manager') {
        await ctx.reply(
            `⚠️ Пользователь @${manager.username} больше не является менеджером.\n\n` +
            `Выберите другого кандидата из списка.`
        );
        return ctx.answerCbQuery();
    }
    
    // Проверяем, что менеджер все еще видимый
    if (!manager.is_visible) {
        await ctx.reply(
            `⚠️ Пользователь @${manager.username} больше не доступен для назначения.\n\n` +
            `Выберите другого кандидата из списка.`
        );
        return ctx.answerCbQuery();
    }
    
    // Проверяем лимит менеджеров (максимум 3)
    const existingManagers = await ProjectManager.findByProject(projectId);
    const totalManagers = existingManagers.length;
    
    if (totalManagers >= 3) {
        await ctx.reply('❌ Достигнут лимит менеджеров (максимум 3). Невозможно добавить еще одного менеджера.');
        return ctx.answerCbQuery();
    }
    
    try {
        // Добавляем менеджера
        await Project.addUserToProjectRoles(managerId, projectId, 'manager');
        await ProjectManager.create({ project_id: projectId, manager_id: managerId, status: 'pending' });
        
        // Отправляем уведомление менеджеру
        await ctx.telegram.sendMessage(
            manager.telegram_id,
            `Вас пригласили как дополнительного менеджера в проект "${project.name}" от ${ctx.user.first_name} ${ctx.user.last_name || ''}`,
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
        
        await ctx.reply(`✅ Дополнительный менеджер @${manager.username} приглашен!`);
        
    } catch (error) {
        console.error('Error in add_manager_select:', error);
        await ctx.reply('❌ Произошла ошибка при добавлении менеджера. Попробуйте еще раз.');
    }
    
    await ctx.answerCbQuery();
});

// Заказчик ищет менеджера по никнейму
bot.action(/^search_manager_(\d+)$/, async (ctx) => {
    const projectId = ctx.match[1];
    if (!ctx.user) ctx.user = await User.findByTelegramId(ctx.from.id);
    const project = await Project.findById(projectId);
    if (!project) return ctx.reply('Проект не найден.');
    
    // Проверяем права доступа
    if (project.customer_id !== ctx.user.id) {
        return ctx.reply('❌ У вас нет прав для управления этим проектом.');
    }
    
    // Проверяем лимит менеджеров
    const existingManagers = await ProjectManager.findByProject(projectId);
    if (existingManagers.length >= 3) {
        await ctx.reply('❌ Достигнут лимит менеджеров (максимум 3). Невозможно добавить еще одного менеджера.');
        return ctx.answerCbQuery();
    }
    
    // Начинаем поиск по никнейму
    ctx.session = ctx.session || {};
    ctx.session.searchingManager = true;
    ctx.session.searchProjectId = projectId;
    
    await ctx.reply(
        '🔍 <b>Поиск менеджера по никнейму</b>\n\n' +
        'Введите никнейм менеджера (без @):',
        { 
            parse_mode: 'HTML',
            reply_markup: {
                keyboard: [['❌ Отменить поиск']],
                resize_keyboard: true,
                one_time_keyboard: true
            }
        }
    );
    await ctx.answerCbQuery();
});

// Заказчик меняет менеджера
bot.action(/^change_manager_(\d+)$/, async (ctx) => {
    const projectId = ctx.match[1];
    if (!ctx.user) ctx.user = await User.findByTelegramId(ctx.from.id);
    const project = await Project.findById(projectId);
    if (!project) return ctx.reply('Проект не найден.');
    
    // Проверяем права доступа
    if (project.customer_id !== ctx.user.id) {
        return ctx.reply('❌ У вас нет прав для управления этим проектом.');
    }
    
    // Получаем текущих менеджеров
    const currentManagers = await ProjectManager.findByProject(projectId);
    const acceptedManagers = currentManagers.filter(m => m.status === 'accepted');
    
    if (acceptedManagers.length === 0) {
        await ctx.reply('❌ В проекте нет принятых менеджеров для смены.');
        return ctx.answerCbQuery();
    }
    
    // Показываем список текущих менеджеров для смены
    let list = '🔄 <b>Выберите менеджера для замены:</b>\n\n';
    const buttons = [];
    
    for (const m of acceptedManagers) {
        const user = await User.findById(m.manager_id);
        if (user) {
            list += `• @${user.username} — ${user.first_name || ''} ${user.last_name || ''}\n`;
            buttons.push([{
                text: `Сменить @${user.username}`,
                callback_data: `change_manager_select_${projectId}_${m.manager_id}`
            }]);
        }
    }
    
    await ctx.reply(list, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons }
    });
    await ctx.answerCbQuery();
});

// Заказчик выбирает менеджера для замены
bot.action(/^change_manager_select_(\d+)_(\d+)$/, async (ctx) => {
    const projectId = ctx.match[1];
    const oldManagerId = ctx.match[2];
    if (!ctx.user) ctx.user = await User.findByTelegramId(ctx.from.id);
    
    const project = await Project.findById(projectId);
    const oldManager = await User.findById(oldManagerId);
    if (!project || !oldManager) return ctx.reply('Проект или менеджер не найден.');
    
    // Проверяем права доступа
    if (project.customer_id !== ctx.user.id) {
        return ctx.reply('❌ У вас нет прав для управления этим проектом.');
    }
    
    // Проверяем статус проекта
    const allowedStatuses = ['active', 'searching_executors'];
    if (!allowedStatuses.includes(project.status)) {
        const statusNames = {
            'draft': 'черновик',
            'archived': 'архив',
            'searching_manager': 'поиск менеджера',
            'in_progress': 'в работе'
        };
        const statusName = statusNames[project.status] || project.status;
        await ctx.reply(`❌ Управление менеджерами недоступно для проектов в статусе "${statusName}".\n\nКнопки управления менеджерами отображаются только для проектов в статусе "Активный" или "Поиск исполнителей".`);
        return ctx.answerCbQuery();
    }
    
    // Показываем список доступных менеджеров для замены
    const managers = await User.findVisibleByRole('manager');
    if (!managers || managers.length === 0) {
        await ctx.reply('❌ В системе пока нет доступных менеджеров с открытым профилем.');
        return ctx.answerCbQuery();
    }
    
    // Исключаем заказчика и текущего менеджера
    const availableManagers = managers.filter(m => 
        m.id !== ctx.user.id && m.id !== oldManagerId
    );
    
    if (availableManagers.length === 0) {
        await ctx.reply('❌ Нет других менеджеров для замены.');
        return ctx.answerCbQuery();
    }
    
    let list = `🔄 <b>Выберите нового менеджера для замены @${oldManager.username}:</b>\n\n`;
    for (const m of availableManagers) {
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
    
    // Создаем кнопки для каждого менеджера
    const buttons = availableManagers.map(m => [{
        text: `@${m.username}`,
        callback_data: `change_manager_confirm_${projectId}_${oldManagerId}_${m.id}`
    }]);
    
    await ctx.reply(list, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons }
    });
    await ctx.answerCbQuery();
});

// Заказчик подтверждает смену менеджера
bot.action(/^change_manager_confirm_(\d+)_(\d+)_(\d+)$/, async (ctx) => {
    const projectId = ctx.match[1];
    const oldManagerId = ctx.match[2];
    const newManagerId = ctx.match[3];
    if (!ctx.user) ctx.user = await User.findByTelegramId(ctx.from.id);
    
    const project = await Project.findById(projectId);
    const oldManager = await User.findById(oldManagerId);
    const newManager = await User.findById(newManagerId);
    if (!project || !oldManager || !newManager) {
        await ctx.reply('❌ Проект или менеджер не найден.');
        return ctx.answerCbQuery();
    }
    
    // Проверяем права доступа
    if (project.customer_id !== ctx.user.id) {
        await ctx.reply('❌ У вас нет прав для управления этим проектом.');
        return ctx.answerCbQuery();
    }
    
    // Проверяем, что новый менеджер все еще является менеджером
    if (newManager.main_role !== 'manager') {
        await ctx.reply(
            `⚠️ Пользователь @${newManager.username} больше не является менеджером.\n\n` +
            `Выберите другого кандидата из списка.`
        );
        return ctx.answerCbQuery();
    }
    
    // Проверяем, что новый менеджер все еще видимый
    if (!newManager.is_visible) {
        await ctx.reply(
            `⚠️ Пользователь @${newManager.username} больше не доступен для назначения.\n\n` +
            `Выберите другого кандидата из списка.`
        );
        return ctx.answerCbQuery();
    }
    
    try {
        // Удаляем старого менеджера
        await ProjectManager.deleteByProjectAndManager(projectId, oldManagerId);
        await Project.removeUserFromProjectRoles(oldManagerId, projectId, 'manager');
        
        // Добавляем нового менеджера
        await Project.addUserToProjectRoles(newManagerId, projectId, 'manager');
        await ProjectManager.create({ project_id: projectId, manager_id: newManagerId, status: 'pending' });
        
        // Уведомляем старого менеджера
        await ctx.telegram.sendMessage(
            oldManager.telegram_id,
            `Вас заменили на менеджера в проекте "${project.name}"`
        );
        
        // Отправляем уведомление новому менеджеру
        await ctx.telegram.sendMessage(
            newManager.telegram_id,
            `Вас назначили менеджером проекта "${project.name}" от ${ctx.user.first_name} ${ctx.user.last_name || ''}`,
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
        
        await ctx.reply(`✅ Менеджер @${oldManager.username} заменен на @${newManager.username}!`);
        
    } catch (error) {
        console.error('Error in change_manager_confirm:', error);
        await ctx.reply('❌ Произошла ошибка при смене менеджера. Попробуйте еще раз.');
    }
    
    await ctx.answerCbQuery();
});

// Заказчик изменяет статус проекта
bot.action(/^change_status_(\d+)$/, async (ctx) => {
    const projectId = ctx.match[1];
    if (!ctx.user) ctx.user = await User.findByTelegramId(ctx.from.id);
    const project = await Project.findById(projectId);
    if (!project) return ctx.reply('Проект не найден.');
    
    // Проверяем права доступа
    if (project.customer_id !== ctx.user.id) {
        return ctx.reply('❌ У вас нет прав для управления этим проектом.');
    }
    
    const statusButtons = [
        [
            { text: '📝 Черновик', callback_data: `set_status_${projectId}_draft` },
            { text: '🚀 Активный', callback_data: `set_status_${projectId}_active` }
        ],
        [
            { text: '🚧 В работе', callback_data: `set_status_${projectId}_in_progress` },
            { text: '📦 Архив', callback_data: `set_status_${projectId}_archived` }
        ]
    ];
    
    await ctx.reply('📊 <b>Выберите новый статус проекта:</b>', {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: statusButtons }
    });
    await ctx.answerCbQuery();
});

// Заказчик устанавливает статус проекта
bot.action(/^set_status_(\d+)_(.+)$/, async (ctx) => {
    const projectId = ctx.match[1];
    const newStatus = ctx.match[2];
    if (!ctx.user) ctx.user = await User.findByTelegramId(ctx.from.id);
    
    const project = await Project.findById(projectId);
    if (!project) return ctx.reply('Проект не найден.');
    
    // Проверяем права доступа
    if (project.customer_id !== ctx.user.id) {
        return ctx.reply('❌ У вас нет прав для управления этим проектом.');
    }
    
    // Обновляем статус
    await Project.updateStatus(projectId, newStatus);
    
    const statusNames = {
        'draft': '📝 Черновик',
        'active': '🚀 Активный',
        'in_progress': '🚧 В работе',
        'archived': '📦 Архив'
    };
    
    await ctx.reply(`✅ Статус проекта изменен на: ${statusNames[newStatus] || newStatus}`);
    await ctx.answerCbQuery();
});

// Заказчик удаляет проект через кнопку
bot.action(/^delete_project_(\d+)$/, async (ctx) => {
    const projectId = ctx.match[1];
    if (!ctx.user) ctx.user = await User.findByTelegramId(ctx.from.id);
    const project = await Project.findById(projectId);
    if (!project) return ctx.reply('Проект не найден.');
    
    // Проверяем права доступа
    if (project.customer_id !== ctx.user.id) {
        return ctx.reply('❌ У вас нет прав для удаления этого проекта.');
    }
    
    // Проверяем, что проект не активен
    if (project.status === 'active') {
        return ctx.reply('❌ Нельзя удалить активный проект. Сначала измените статус на "Архив".');
    }
    
    // Запрашиваем подтверждение
    await ctx.reply(
        `🗑️ <b>Подтверждение удаления проекта</b>\n\n` +
        `📋 <b>Проект:</b> ${project.name}\n` +
        `🆔 <b>ID:</b> ${projectId}\n\n` +
        `⚠️ <b>ВНИМАНИЕ!</b> Это действие нельзя отменить!\n\n` +
        `Вы уверены, что хотите удалить проект?`,
        {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '✅ Да, удалить', callback_data: `confirm_delete_${projectId}` },
                        { text: '❌ Отмена', callback_data: `cancel_delete_${projectId}` }
                    ]
                ]
            }
        }
    );
    await ctx.answerCbQuery();
});

// Заказчик подтверждает удаление проекта
bot.action(/^confirm_delete_(\d+)$/, async (ctx) => {
    const projectId = ctx.match[1];
    if (!ctx.user) ctx.user = await User.findByTelegramId(ctx.from.id);
    
    const project = await Project.findById(projectId);
    if (!project) return ctx.reply('Проект не найден.');
    
    // Проверяем права доступа
    if (project.customer_id !== ctx.user.id) {
        return ctx.reply('❌ У вас нет прав для удаления этого проекта.');
    }
    
    // Выполняем удаление
    const success = await Project.delete(projectId, ctx.user.id);
    
    if (success) {
        await ctx.reply(
            `✅ <b>Проект успешно удален!</b>\n\n` +
            `📋 Проект: ${project.name}\n` +
            `🆔 ID: ${projectId}\n\n` +
            `🗑️ Все данные проекта были безвозвратно удалены.`,
            { parse_mode: 'HTML' }
        );
    } else {
        await ctx.reply('❌ Не удалось удалить проект. Попробуйте позже.');
    }
    await ctx.answerCbQuery();
});

// Заказчик отменяет удаление проекта
bot.action(/^cancel_delete_(\d+)$/, async (ctx) => {
    await ctx.reply('✅ Удаление проекта отменено.');
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
    
    // Обработка поиска менеджера по никнейму
    if (ctx.session?.searchingManager) {
        const projectId = ctx.session.searchProjectId;
        const username = ctx.message.text.replace(/^@/, ''); // Убираем @ если есть
        
        // Обработка отмены поиска
        if (ctx.message.text === '❌ Отменить поиск') {
            delete ctx.session.searchingManager;
            delete ctx.session.searchProjectId;
            await ctx.reply(
                '✅ Поиск менеджера отменен.',
                {
                    reply_markup: {
                        keyboard: [['📋 Мои проекты']],
                        resize_keyboard: true
                    }
                }
            );
            return;
        }
        
        if (!ctx.user) ctx.user = await User.findByTelegramId(ctx.from.id);
        const project = await Project.findById(projectId);
        if (!project) return ctx.reply('Проект не найден.');
        
        // Проверяем права доступа
        if (project.customer_id !== ctx.user.id) {
            return ctx.reply('❌ У вас нет прав для управления этим проектом.');
        }
        
        // Проверяем статус проекта
        const allowedStatuses = ['active', 'searching_executors'];
        if (!allowedStatuses.includes(project.status)) {
            const statusNames = {
                'draft': 'черновик',
                'archived': 'архив',
                'searching_manager': 'поиск менеджера',
                'in_progress': 'в работе'
            };
            const statusName = statusNames[project.status] || project.status;
            await ctx.reply(`❌ Управление менеджерами недоступно для проектов в статусе "${statusName}".\n\nКнопки управления менеджерами отображаются только для проектов в статусе "Активный" или "Поиск исполнителей".`);
            return ctx.answerCbQuery();
        }
        
        // Ищем менеджера по никнейму
        const manager = await User.findByUsername(username);
        if (!manager) {
            await ctx.reply(
                '❌ Менеджер с таким никнеймом не найден.\n\n' +
                'Попробуйте еще раз или нажмите "❌ Отменить поиск":',
                {
                    reply_markup: {
                        keyboard: [['❌ Отменить поиск']],
                        resize_keyboard: true,
                        one_time_keyboard: true
                    }
                }
            );
            return;
        }
        
        // Проверяем, что это менеджер
        if (manager.main_role !== 'manager') {
            await ctx.reply(
                '❌ Пользователь с таким никнеймом не является менеджером.\n\n' +
                'Попробуйте еще раз или нажмите "❌ Отменить поиск":',
                {
                    reply_markup: {
                        keyboard: [['❌ Отменить поиск']],
                        resize_keyboard: true,
                        one_time_keyboard: true
                    }
                }
            );
            return;
        }
        
        // Проверяем, что менеджер не заказчик
        if (manager.id === ctx.user.id) {
            await ctx.reply(
                '❌ Вы не можете добавить себя как менеджера.\n\n' +
                'Попробуйте еще раз или нажмите "❌ Отменить поиск":',
                {
                    reply_markup: {
                        keyboard: [['❌ Отменить поиск']],
                        resize_keyboard: true,
                        one_time_keyboard: true
                    }
                }
            );
            return;
        }
        
        // Проверяем, что менеджер уже не добавлен
        const existingManagers = await ProjectManager.findByProject(projectId);
        const isAlreadyManager = existingManagers.some(m => m.manager_id === manager.id);
        if (isAlreadyManager) {
            await ctx.reply(
                '❌ Этот менеджер уже добавлен в проект.\n\n' +
                'Попробуйте еще раз или нажмите "❌ Отменить поиск":',
                {
                    reply_markup: {
                        keyboard: [['❌ Отменить поиск']],
                        resize_keyboard: true,
                        one_time_keyboard: true
                    }
                }
            );
            return;
        }
        
        // Проверяем лимит менеджеров
        if (existingManagers.length >= 3) {
            await ctx.reply(
                '❌ Достигнут лимит менеджеров (максимум 3).\n\n' +
                'Попробуйте еще раз или нажмите "❌ Отменить поиск":',
                {
                    reply_markup: {
                        keyboard: [['❌ Отменить поиск']],
                        resize_keyboard: true,
                        one_time_keyboard: true
                    }
                }
            );
            return;
        }
        
        // Добавляем менеджера
        await Project.addUserToProjectRoles(manager.id, projectId, 'manager');
        await ProjectManager.create({ project_id: projectId, manager_id: manager.id, status: 'pending' });
        
        // Отправляем уведомление менеджеру
        await ctx.telegram.sendMessage(
            manager.telegram_id,
            `Вас пригласили как менеджера в проект "${project.name}" от ${ctx.user.first_name} ${ctx.user.last_name || ''}`,
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
        
        // Очищаем сессию поиска
        delete ctx.session.searchingManager;
        delete ctx.session.searchProjectId;
        
        await ctx.reply(
            `✅ Менеджер @${manager.username} найден и приглашен в проект!\n\n` +
            `Ожидаем его ответа...`,
            {
                reply_markup: {
                    keyboard: [['📋 Мои проекты']],
                    resize_keyboard: true
                }
            }
        );
        return;
    }
    
    return next();
});

// Обработка неизвестных команд
bot.on('message', async (ctx, next) => {
    console.log('Raw message:', ctx.message.text);
    if (ctx.message.handled) return next();
    
    if (ctx.message.text && !ctx.message.text.startsWith('/')) {
        await ctx.reply('❓ Неизвестная команда, нажмите /start и вернитесь в исходное состояние');
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

// Обработка предварительного просмотра проекта (для менеджеров)
bot.action(/^project_preview_(\d+)$/, async (ctx) => {
    console.log('=== PROJECT PREVIEW ACTION TRIGGERED ===');
    console.log('User:', ctx.user?.id, ctx.user?.username);
    console.log('Match:', ctx.match);
    
    const projectId = ctx.match[1];
    console.log('Project ID from preview action:', projectId);
    
    // Создаем контекст для функции projectPreview
    ctx.params = [projectId];
    
    try {
        await projectPreview(ctx);
    } catch (error) {
        console.error('Error in project_preview action:', error);
        await ctx.reply('❌ Произошла ошибка при загрузке информации о проекте.');
    }
    
    await ctx.answerCbQuery();
});

// Обработка выхода менеджера из проекта
bot.action(/^leave_project_(\d+)$/, async (ctx) => {
    const projectId = ctx.match[1];
    if (!ctx.user) ctx.user = await User.findByTelegramId(ctx.from.id);
    const project = await Project.findById(projectId);
    if (!project) {
        await ctx.answerCbQuery('❌ Проект не найден или был удалён.');
        return;
    }
    
    // Проверяем, что пользователь является принятым менеджером проекта
    const pm = await ProjectManager.findByProjectAndManager(projectId, ctx.user.id);
    if (!pm || pm.status !== 'accepted') {
        await ctx.answerCbQuery('❌ У вас нет прав для выхода из этого проекта.');
        return;
    }
    
    // Проверяем ограничения
    if (project.status === 'completed' || project.status === 'archived') {
        await ctx.answerCbQuery('❌ Нельзя покинуть завершенный или архивный проект.');
        return;
    }
    
    // Проверяем, что менеджер не является последним исполнителем
    const members = await Project.getMembers(projectId);
    const executors = members.filter(m => m.member_role === 'executor');
    const managers = members.filter(m => m.member_role === 'manager');
    
    // Если менеджер является единственным участником проекта (кроме заказчика)
    if (managers.length === 1 && executors.length === 0) {
        await ctx.answerCbQuery('❌ Нельзя покинуть проект, если вы являетесь единственным участником.');
        return;
    }
    
    // Показываем диалог подтверждения
    await ctx.reply(
        `🚪 <b>Подтверждение выхода из проекта</b>\n\n` +
        `Вы уверены, что хотите покинуть проект "${project.name}"?\n\n` +
        `⚠️ <b>Внимание!</b> После выхода:\n` +
        `• Вы будете удалены из списка участников проекта\n` +
        `• Заказчик будет уведомлен о вашем выходе\n` +
        `• Если вы были единственным менеджером, заказчик станет менеджером\n` +
        `• Проект может вернуться к статусу "Активный"\n\n` +
        `Это действие можно отменить только повторным приглашением от заказчика.`,
        {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '✅ Да, покинуть', callback_data: `confirm_leave_project_${projectId}` },
                        { text: '❌ Отмена', callback_data: `cancel_leave_project_${projectId}` }
                    ]
                ]
            }
        }
    );
    
    await ctx.answerCbQuery();
});

// Обработка подтверждения выхода из проекта
bot.action(/^confirm_leave_project_(\d+)$/, async (ctx) => {
    const projectId = ctx.match[1];
    if (!ctx.user) ctx.user = await User.findByTelegramId(ctx.from.id);
    const project = await Project.findById(projectId);
    if (!project) {
        await ctx.answerCbQuery('❌ Проект не найден или был удалён.');
        return;
    }
    
    // Проверяем, что пользователь является принятым менеджером проекта
    const pm = await ProjectManager.findByProjectAndManager(projectId, ctx.user.id);
    if (!pm || pm.status !== 'accepted') {
        await ctx.answerCbQuery('❌ У вас нет прав для выхода из этого проекта.');
        return;
    }
    
    try {
        // 1. Удаляем менеджера из project_managers
        await ProjectManager.deleteById(pm.id);
        
        // 2. Удаляем менеджера из project_members
        await Project.removeMember(projectId, ctx.user.id);
        
        // 3. Проверяем, есть ли еще принятые менеджеры
        const allManagers = await ProjectManager.findByProject(projectId);
        const acceptedManagers = allManagers.filter(m => m.status === 'accepted');
        
        // 4. Если нет принятых менеджеров, назначаем заказчика
        if (acceptedManagers.length === 0) {
            // Добавляем заказчика как менеджера
            await Project.addMember(projectId, project.customer_id, 'manager');
            await ProjectManager.create({ 
                project_id: projectId, 
                manager_id: project.customer_id, 
                status: 'accepted' 
            });
            
            // Меняем статус проекта на 'active' если он был 'in_progress'
            if (project.status === 'in_progress') {
                await Project.updateStatus(projectId, 'active');
            }
        }
        
        // 5. Уведомляем заказчика
        const customer = await User.findById(project.customer_id);
        if (customer) {
            await ctx.telegram.sendMessage(
                customer.telegram_id,
                `🔔 Менеджер @${ctx.user.username || ''} покинул ваш проект «${project.name}».`
            );
        }
        
        // 6. Логируем событие
        await AuditLog.create(
            ctx.user.id,
            'MANAGER_LEFT_PROJECT',
            projectId,
            { managerUsername: ctx.user.username, projectName: project.name }
        );
        
        // 7. Обновляем карточку проекта
        ctx.params = [projectId];
        await projectDetails(ctx);
        
        await ctx.answerCbQuery('✅ Вы успешно покинули проект!');
        
    } catch (error) {
        console.error('Error in confirm_leave_project:', error);
        await ctx.answerCbQuery('❌ Произошла ошибка при выходе из проекта.');
    }
});

// Обработка отмены выхода из проекта
bot.action(/^cancel_leave_project_(\d+)$/, async (ctx) => {
    const projectId = ctx.match[1];
    if (!ctx.user) ctx.user = await User.findByTelegramId(ctx.from.id);
    
    // Просто обновляем карточку проекта
    ctx.params = [projectId];
    await projectDetails(ctx);
    
    await ctx.answerCbQuery('❌ Выход из проекта отменен.');
});

// Обработка callback-кнопок меню редактирования профиля
bot.action('edit_one_field', async (ctx) => {
    const user = await User.findByTelegramId(ctx.from.id);
    await showEditFieldList(ctx, user);
    await ctx.answerCbQuery();
});
bot.action('edit_full_profile', async (ctx) => {
    await handleProfileCommand(ctx); // старый flow
    await ctx.answerCbQuery();
});
bot.action('edit_cancel', async (ctx) => {
    await ctx.reply('Редактирование профиля отменено.');
    await ctx.answerCbQuery();
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