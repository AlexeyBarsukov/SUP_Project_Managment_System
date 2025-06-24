const { Markup } = require('telegraf');
const User = require('../../db/models/User');
const { 
    MANAGER_SPECIALIZATIONS, 
    MANAGER_SKILLS, 
    EXPERIENCE_RANGES, 
    SALARY_RANGES 
} = require('../../utils/constants');
const { 
    validateProfileField, 
    formatFieldCounter, 
    validateProfileData,
    PROFILE_VALIDATION 
} = require('../../utils/validation');
const { Telegraf } = require('telegraf');

// Состояния для заполнения профиля
const PROFILE_STATES = {
    SPECIALIZATION: 'profile_specialization',
    EXPERIENCE: 'profile_experience',
    SKILLS: 'profile_skills',
    ACHIEVEMENTS: 'profile_achievements',
    SALARY: 'profile_salary',
    CONTACTS: 'profile_contacts'
};

// Временное хранилище данных профиля
const profileData = new Map();

// Состояние навигации для каждого пользователя
const profileNavigation = new Map();

// Константы для шагов навигации
const NAVIGATION_STEPS = {
    SPECIALIZATION: 'specialization',
    EXPERIENCE: 'experience',
    SKILLS: 'skills',
    ACHIEVEMENTS: 'achievements',
    SALARY: 'salary',
    CONTACTS: 'contacts'
};

// Создаем клавиатуры
function createSpecializationKeyboard() {
    const buttons = MANAGER_SPECIALIZATIONS.map(spec => [Markup.button.callback(spec, `spec_${spec}`)]);
    buttons.push([Markup.button.callback('🔙 Назад', 'profile_back')]);
    return Markup.inlineKeyboard(buttons);
}

function createExperienceKeyboard() {
    const buttons = EXPERIENCE_RANGES.map(exp => [Markup.button.callback(exp, `exp_${exp}`)]);
    buttons.push([Markup.button.callback('🔙 Назад', 'profile_back')]);
    return Markup.inlineKeyboard(buttons);
}

function createSkillsKeyboard() {
    const buttons = MANAGER_SKILLS.map(skill => [Markup.button.callback(skill, `skill_${skill}`)]);
    buttons.push([Markup.button.callback('🔙 Назад', 'profile_back')]);
    return Markup.inlineKeyboard(buttons);
}

function createSalaryKeyboard() {
    const buttons = SALARY_RANGES.map(salary => [Markup.button.callback(salary, `salary_${salary}`)]);
    buttons.push([Markup.button.callback('✏️ Ввести вручную', 'fill_salary')]);
    buttons.push([Markup.button.callback('🔙 Назад', 'profile_back')]);
    return Markup.inlineKeyboard(buttons);
}

function createOptionalKeyboard(type) {
    let callback;
    if (type === 'achievements') callback = 'fill_achievements';
    else if (type === 'salary') callback = 'fill_salary';
    else if (type === 'contacts') callback = 'fill_contacts';
    else callback = 'fill_optional';

    return Markup.inlineKeyboard([
        [Markup.button.callback('➕ Добавить', callback)],
        [Markup.button.callback('Пропустить', 'skip_optional')],
        [Markup.button.callback('🔙 Назад', 'profile_back')]
    ]);
}

function createSkillsKeyboardWithSelected(selectedSkills) {
    const buttons = [];
    
    // Группируем навыки по 2 в ряд для компактности
    for (let i = 0; i < MANAGER_SKILLS.length; i += 2) {
        const row = [];
        const skill1 = MANAGER_SKILLS[i];
        const skill2 = MANAGER_SKILLS[i + 1];
        
        // Первый навык в ряду
        const isSelected1 = selectedSkills.includes(skill1);
        row.push(Markup.button.callback(
            isSelected1 ? `✅ ${skill1}` : skill1,
            `skill_${skill1}`
        ));
        
        // Второй навык в ряду (если есть)
        if (skill2) {
            const isSelected2 = selectedSkills.includes(skill2);
            row.push(Markup.button.callback(
                isSelected2 ? `✅ ${skill2}` : skill2,
                `skill_${skill2}`
            ));
        }
        
        buttons.push(row);
    }
    
    // Добавляем кнопки управления
    buttons.push([
        Markup.button.callback('✅ Готово', 'skills_done'),
        Markup.button.callback('🗑 Очистить все', 'skills_clear')
    ]);
    buttons.push([Markup.button.callback('🔙 Назад', 'profile_back')]);
    
    return Markup.inlineKeyboard(buttons);
}

// Обработчики команд
async function handleProfileCommand(ctx) {
    const user = await User.findByTelegramId(ctx.from.id);
    
    if (!user) {
        return ctx.reply('Пользователь не найден. Пожалуйста, начните с /start');
    }
    
    if (user.main_role !== 'manager') {
        return ctx.reply('Эта команда доступна только менеджерам.');
    }
    
    const userId = ctx.from.id;
    
    // Инициализируем сессию для предотвращения ошибок
    if (!ctx.session) {
        ctx.session = {};
    }
    
    // Инициализируем отслеживание пропущенных шагов
    if (!ctx.session.skippedSteps) {
        ctx.session.skippedSteps = {};
    }
    
    // Очищаем предыдущие данные профиля и навигации
    profileData.delete(userId);
    profileNavigation.delete(userId);
    
    // Инициализируем данные профиля и навигацию
    profileData.set(userId, {});
    setCurrentStep(userId, NAVIGATION_STEPS.SPECIALIZATION);
    
    // Показываем первый шаг
    await showCurrentStep(ctx, NAVIGATION_STEPS.SPECIALIZATION);
}

// Обработчики кнопок
async function handleSpecialization(ctx) {
    const data = ctx.callbackQuery.data;
    const specialization = data.replace('spec_', '');
    const userId = ctx.from.id;
    
    if (!profileData.has(userId)) {
        profileData.set(userId, {});
    }
    
    // Инициализируем сессию, если она не существует
    if (!ctx.session) {
        ctx.session = {};
    }
    
    if (specialization === 'Свой вариант') {
        ctx.session = { 
            ...ctx.session, 
            profileState: PROFILE_STATES.SPECIALIZATION,
            waitingForSpecializationInput: true  // Добавляем флаг
        };
        await ctx.reply('Введите свою специализацию:');
        await ctx.answerCbQuery();
        return;
    }
    
    profileData.get(userId).specialization = specialization;
    
    // Инициализируем отслеживание пропущенных шагов
    if (!ctx.session.skippedSteps) {
        ctx.session.skippedSteps = {};
    }
    
    // Явно переходим к опыту
    setCurrentStep(userId, NAVIGATION_STEPS.EXPERIENCE);
    await showCurrentStep(ctx, NAVIGATION_STEPS.EXPERIENCE);
    await ctx.answerCbQuery();
}

async function handleExperience(ctx) {
    const data = ctx.callbackQuery.data;
    const experience = data.replace('exp_', '');
    const userId = ctx.from.id;
    
    profileData.get(userId).experience = experience;
    
    // Явно переходим к навыкам
    setCurrentStep(userId, NAVIGATION_STEPS.SKILLS);
    await showCurrentStep(ctx, NAVIGATION_STEPS.SKILLS);
    await ctx.answerCbQuery();
}

async function handleSkills(ctx) {
    const data = ctx.callbackQuery.data;
    const skill = data.replace('skill_', '');
    const userId = ctx.from.id;
    
    // Инициализируем данные профиля, если они не существуют
    if (!profileData.has(userId)) {
        profileData.set(userId, {});
    }
    
    if (!profileData.get(userId).skills) {
        profileData.get(userId).skills = [];
    }
    
    if (skill === 'Свой вариант') {
        ctx.session = { 
            ...ctx.session, 
            profileState: PROFILE_STATES.SKILLS,
            waitingForSkillsInput: true  // Добавляем флаг
        };
        await ctx.reply('Введите свои навыки через запятую:');
        await ctx.answerCbQuery();
        return;
    }
    
    const skills = profileData.get(userId).skills;
    const skillIndex = skills.indexOf(skill);
    
    if (skillIndex > -1) {
        skills.splice(skillIndex, 1);
    } else {
        skills.push(skill);
    }
    
    await ctx.reply(
        `Выбранные навыки: ${skills.join(', ')}\n\n` +
        'Выберите навыки (нажмите на выбранный навык, чтобы убрать его):',
        createSkillsKeyboardWithSelected(skills)
    );
    await ctx.answerCbQuery();
}

async function handleSkillsDone(ctx) {
    const userId = ctx.from.id;
    
    // Инициализируем данные профиля, если они не существуют
    if (!profileData.has(userId)) {
        profileData.set(userId, {});
    }
    
    const skills = profileData.get(userId).skills || [];
    
    if (skills.length === 0) {
        await ctx.reply('Пожалуйста, выберите хотя бы один навык.');
        await ctx.answerCbQuery();
        return;
    }
    
    // Инициализируем отслеживание пропущенных шагов
    if (!ctx.session.skippedSteps) {
        ctx.session.skippedSteps = {};
    }
    
    // Переходим к следующему шагу через навигацию
    setCurrentStep(userId, NAVIGATION_STEPS.ACHIEVEMENTS);
    await showCurrentStep(ctx, NAVIGATION_STEPS.ACHIEVEMENTS);
    
    await ctx.answerCbQuery();
}

async function handleSkillsClear(ctx) {
    const userId = ctx.from.id;
    
    // Инициализируем данные профиля, если они не существуют
    if (!profileData.has(userId)) {
        profileData.set(userId, {});
    }
    
    profileData.get(userId).skills = [];
    
    await ctx.reply(
        'Все навыки очищены.\n\n' +
        'Выберите навыки:',
        createSkillsKeyboardWithSelected([])
    );
    await ctx.answerCbQuery();
}

async function handleProfileBack(ctx) {
    const userId = ctx.from.id;
    const previousStep = goToPreviousStep(userId);
    
    if (previousStep) {
        await showCurrentStep(ctx, previousStep);
    } else {
        // Если мы на первом шаге, выходим из заполнения профиля
        profileData.delete(userId);
        profileNavigation.delete(userId);
        delete ctx.session.profileState;
        
        await ctx.reply(
            'Заполнение профиля отменено.\n\n' +
            'Используйте "📝 Заполнить профиль" для начала заново.'
        );
    }
    await ctx.answerCbQuery();
}

async function handleAchievements(ctx) {
    const data = ctx.callbackQuery.data;
    const userId = ctx.from.id;
    
    // Инициализируем данные профиля, если они не существуют
    if (!profileData.has(userId)) {
        profileData.set(userId, {});
    }
    
    if (data === 'skip_optional') {
        profileData.get(userId).achievements = null;
        
        // Отмечаем шаг как пропущенный
        if (!ctx.session.skippedSteps) {
            ctx.session.skippedSteps = {};
        }
        ctx.session.skippedSteps.achievements = true;
        
        // Сохраняем навигационное состояние, но сбрасываем флаг ожидания
        if (ctx.session) {
            delete ctx.session.waitingForAchievementsInput;
            // НЕ удаляем profileState, чтобы не нарушить навигацию
        }
        
        // Подтверждаем пропуск
        await ctx.reply('✅ Достижения не указаны (можно добавить позже в профиле).');
        
        // Явно переходим к зарплате
        setCurrentStep(userId, NAVIGATION_STEPS.SALARY);
        await showCurrentStep(ctx, NAVIGATION_STEPS.SALARY);
    } else {
        ctx.session = { 
            ...ctx.session, 
            profileState: PROFILE_STATES.ACHIEVEMENTS,
            waitingForAchievementsInput: true  // Добавляем флаг
        };
        await ctx.reply('Введите ваши достижения (например: "Увеличил прибыль проекта на 30% за полгода"):');
    }
    await ctx.answerCbQuery();
}

async function handleSalary(ctx) {
    const data = ctx.callbackQuery.data;
    const userId = ctx.from.id;

    // Инициализируем данные профиля, если они не существуют
    if (!profileData.has(userId)) {
        profileData.set(userId, {});
    }

    if (data.startsWith('salary_')) {
        // Обработка выбора конкретного диапазона зарплаты
        const salary = data.replace('salary_', '');
        profileData.get(userId).salary_range = salary;
        
        // Явно переходим к контактам
        setCurrentStep(userId, NAVIGATION_STEPS.CONTACTS);
        await showCurrentStep(ctx, NAVIGATION_STEPS.CONTACTS);
        
    } else if (data === 'fill_salary') {
        // Если пользователь хочет ввести зарплату вручную
        ctx.session = { 
            ...ctx.session, 
            profileState: PROFILE_STATES.SALARY,
            waitingForSalaryInput: true
        };
        await ctx.reply(
            'Введите зарплатные ожидания. Примеры:\n' +
            '• от 120 тыс руб\n' +
            '• 150 000 руб\n' +
            '• $2000\n' +
            '• 100 000 - 150 000 руб'
        );
        await ctx.answerCbQuery();
        return;
    }

    await ctx.answerCbQuery();
}

async function handleSalaryRange(ctx) {
    const data = ctx.callbackQuery.data;
    const salary = data.replace('salary_', '');
    const userId = ctx.from.id;
    
    // Инициализируем данные профиля, если они не существуют
    if (!profileData.has(userId)) {
        profileData.set(userId, {});
    }
    
    profileData.get(userId).salary_range = salary;
    
    // Явно переходим к контактам
    setCurrentStep(userId, NAVIGATION_STEPS.CONTACTS);
    await showCurrentStep(ctx, NAVIGATION_STEPS.CONTACTS);
    await ctx.answerCbQuery();
}

async function handleContacts(ctx) {
    const data = ctx.callbackQuery.data;
    const userId = ctx.from.id;
    
    // Инициализируем данные профиля, если они не существуют
    if (!profileData.has(userId)) {
        profileData.set(userId, {});
    }
    
    if (data === 'skip_optional') {
        profileData.get(userId).contacts = null;
        
        // Отмечаем шаг как пропущенный
        if (!ctx.session.skippedSteps) {
            ctx.session.skippedSteps = {};
        }
        ctx.session.skippedSteps.contacts = true;
        
        // Сохраняем навигационное состояние, но сбрасываем флаг ожидания
        if (ctx.session) {
            delete ctx.session.waitingForContactsInput;
            // НЕ удаляем profileState, чтобы не нарушить навигацию
        }
        
        // Подтверждаем пропуск и сохраняем профиль
        await ctx.reply('✅ Контактная информация не указана (можно добавить позже в профиле).');
        await saveProfile(ctx);
    } else {
        ctx.session = { 
            ...ctx.session, 
            profileState: PROFILE_STATES.CONTACTS,
            waitingForContactsInput: true  // Добавляем флаг
        };
        await ctx.reply('Введите контактную информацию (например, @username):');
    }
    await ctx.answerCbQuery();
}

// Обновляем функцию сохранения профиля с валидацией
async function saveProfile(ctx) {
    const userId = ctx.from.id;
    const data = profileData.get(userId);
    
    if (!data) {
        await ctx.reply('❌ Данные профиля не найдены. Начните заполнение заново.');
        return;
    }
    
    // Валидация всех данных перед сохранением
    const validation = validateProfileData(data);
    if (!validation.canSave) {
        let errorMessage = '❌ Ошибки валидации:\n';
        validation.errors.forEach(error => {
            errorMessage += `• ${error}\n`;
        });
        errorMessage += '\nИсправьте ошибки и попробуйте снова.';
        await ctx.reply(errorMessage);
        return;
    }
    
    try {
        // Сохраняем данные в базу
        await User.updateManagerProfile(userId, data);
        
        // Очищаем данные сессии
        profileData.delete(userId);
        profileNavigation.delete(userId);
        if (ctx.session) {
            delete ctx.session.profileState;
            delete ctx.session.waitingForSpecializationInput;
            delete ctx.session.waitingForSkillsInput;
            delete ctx.session.waitingForAchievementsInput;
            delete ctx.session.waitingForSalaryInput;
            delete ctx.session.waitingForContactsInput;
            delete ctx.session.skippedSteps; // Очищаем отслеживание пропущенных шагов
        }
        
        // Показываем финальный профиль
        const finalProfile = formatFinalProfile(data);
        await ctx.reply(
            `✅ <b>Профиль успешно сохранен!</b>\n\n${finalProfile}`,
            { parse_mode: 'HTML' }
        );
        
    } catch (error) {
        console.error('Error saving profile:', error);
        await ctx.reply('❌ Произошла ошибка при сохранении профиля. Попробуйте еще раз.');
    }
}

function formatFinalProfile(data) {
    let text = '🎉 *Профиль успешно заполнен!*\n\n';
    text += '📋 *Ваш профиль:*\n\n';
    
    text += `🎯 *Специализация:* ${data.specialization || 'Не указано'}\n`;
    text += `⏱ *Опыт:* ${data.experience || 'Не указано'}\n`;
    
    if (data.skills && data.skills.length > 0) {
        const skillsText = Array.isArray(data.skills) ? data.skills.join(', ') : data.skills;
        text += `🛠 *Навыки:* ${skillsText}\n`;
    } else {
        text += `🛠 *Навыки:* Не указано\n`;
    }
    
    text += `🏆 *Достижения:* ${data.achievements || 'Не указано'}\n`;
    text += `💰 *Зарплата:* ${data.salary_range || 'Не указано'}\n`;
    text += `📞 *Контакты:* ${data.contacts || 'Не указано'}\n\n`;
    
    text += 'Теперь заказчики смогут видеть информацию о вас при выборе менеджера для проекта.';
    
    return text;
}

// Обработка текстового ввода с валидацией
async function handleTextInput(ctx) {
    const session = ctx.session;
    if (!session) return false;

    const text = ctx.message.text.trim();
    
    // Обработка ввода специализации
    if (session.profileState === PROFILE_STATES.SPECIALIZATION && session.waitingForSpecializationInput) {
        const validation = validateProfileField('specialization', text);
        if (!validation.isValid) {
            const counter = formatFieldCounter('specialization', text);
            await ctx.reply(`${validation.error}${counter}\n\nВведите специализацию еще раз:`);
            return true;
        }
        
        const userId = ctx.from.id;
        if (!profileData.has(userId)) {
            profileData.set(userId, {});
        }
        profileData.get(userId).specialization = text;
        
        session.waitingForSpecializationInput = false;
        setCurrentStep(userId, NAVIGATION_STEPS.EXPERIENCE);
        await showCurrentStep(ctx, NAVIGATION_STEPS.EXPERIENCE);
        return true;
    }
    
    // Обработка ввода навыков
    if (session.profileState === PROFILE_STATES.SKILLS && session.waitingForSkillsInput) {
        const validation = validateProfileField('skills', text);
        if (!validation.isValid) {
            const counter = formatFieldCounter('skills', text);
            await ctx.reply(`${validation.error}${counter}\n\nВведите навыки еще раз:`);
            return true;
        }
        
        const userId = ctx.from.id;
        if (!profileData.has(userId)) {
            profileData.set(userId, {});
        }
        if (!profileData.get(userId).skills) {
            profileData.get(userId).skills = [];
        }
        
        const skills = text.split(',').map(s => s.trim()).filter(Boolean);
        profileData.get(userId).skills = skills;
        
        session.waitingForSkillsInput = false;
        setCurrentStep(userId, NAVIGATION_STEPS.ACHIEVEMENTS);
        await showCurrentStep(ctx, NAVIGATION_STEPS.ACHIEVEMENTS);
        return true;
    }
    
    // Обработка ввода достижений
    if (session.profileState === PROFILE_STATES.ACHIEVEMENTS && session.waitingForAchievementsInput) {
        const validation = validateProfileField('experience', text); // используем те же лимиты
        if (!validation.isValid) {
            const counter = formatFieldCounter('experience', text);
            await ctx.reply(`${validation.error}${counter}\n\nВведите достижения еще раз:`);
            return true;
        }
        
        const userId = ctx.from.id;
        if (!profileData.has(userId)) {
            profileData.set(userId, {});
        }
        profileData.get(userId).achievements = text;
        
        session.waitingForAchievementsInput = false;
        setCurrentStep(userId, NAVIGATION_STEPS.SALARY);
        await showCurrentStep(ctx, NAVIGATION_STEPS.SALARY);
        return true;
    }
    
    // Обработка ввода зарплаты
    if (session.profileState === PROFILE_STATES.SALARY && session.waitingForSalaryInput) {
        const validation = validateProfileField('salary_range', text);
        if (!validation.isValid) {
            const counter = formatFieldCounter('salary_range', text);
            await ctx.reply(`${validation.error}${counter}\n\nВведите зарплату еще раз:`);
            return true;
        }
        
        const userId = ctx.from.id;
        if (!profileData.has(userId)) {
            profileData.set(userId, {});
        }
        profileData.get(userId).salary_range = text;
        
        session.waitingForSalaryInput = false;
        setCurrentStep(userId, NAVIGATION_STEPS.CONTACTS);
        await showCurrentStep(ctx, NAVIGATION_STEPS.CONTACTS);
        return true;
    }
    
    // Обработка ввода контактов
    if (session.profileState === PROFILE_STATES.CONTACTS && session.waitingForContactsInput) {
        const validation = validateProfileField('contacts', text);
        if (!validation.isValid) {
            const counter = formatFieldCounter('contacts', text);
            await ctx.reply(`${validation.error}${counter}\n\nВведите контакты еще раз:`);
            return true;
        }
        
        const userId = ctx.from.id;
        if (!profileData.has(userId)) {
            profileData.set(userId, {});
        }
        profileData.get(userId).contacts = text;
        
        session.waitingForContactsInput = false;
        await saveProfile(ctx);
        return true;
    }
    
    return false;
}

// Функции навигации
function getCurrentStep(userId) {
    return profileNavigation.get(userId) || NAVIGATION_STEPS.SPECIALIZATION;
}

function setCurrentStep(userId, step) {
    profileNavigation.set(userId, step);
}

function goToPreviousStep(userId) {
    const steps = Object.values(NAVIGATION_STEPS);
    const currentIndex = steps.indexOf(getCurrentStep(userId));
    if (currentIndex > 0) {
        setCurrentStep(userId, steps[currentIndex - 1]);
        return steps[currentIndex - 1];
    }
    return null;
}

function goToNextStep(userId) {
    const steps = Object.values(NAVIGATION_STEPS);
    const currentStep = getCurrentStep(userId);
    const currentIndex = steps.indexOf(currentStep);
    
    console.log('goToNextStep - Current step:', currentStep, 'Index:', currentIndex);
    
    if (currentIndex < steps.length - 1) {
        const nextStep = steps[currentIndex + 1];
        setCurrentStep(userId, nextStep);
        console.log('goToNextStep - Setting next step:', nextStep);
        return nextStep;
    }
    console.log('goToNextStep - No next step available');
    return null;
}

// Функция для отображения текущего шага
async function showCurrentStep(ctx, step) {
    const userId = ctx.from.id;
    
    // Инициализируем данные профиля, если они не существуют
    if (!profileData.has(userId)) {
        profileData.set(userId, {});
    }
    
    const data = profileData.get(userId) || {};
    
    switch (step) {
        case NAVIGATION_STEPS.SPECIALIZATION:
            await ctx.reply(
                'Заполните раздел "О себе":\n\n' +
                '1. ⏳ Специализация: ______\n' +
                '2. 📝 Опыт: [1-3 года]\n' +
                '3. 🛠 Навыки: [Agile, Kanban]\n' +
                '4. 🎯 Достижение: "Увеличил прибыль проекта на 30% за полгода."\n' +
                '5. 💰 Зарплата: [100 000 – 150 000 руб./мес]\n' +
                '6. 📞 Контакты: @username\n\n' +
                'Начнем с выбора специализации:',
                createSpecializationKeyboard()
            );
            break;
            
        case NAVIGATION_STEPS.EXPERIENCE:
            const specText = data.specialization || 'Не выбрано';
            await ctx.reply(
                `1. ✅ Специализация: ${specText}\n` +
                '2. ⏳ Опыт: [1-3 года]\n' +
                '3. 📝 Навыки: [Agile, Kanban]\n' +
                '4. 🎯 Достижение: "Увеличил прибыль проекта на 30% за полгода."\n' +
                '5. 💰 Зарплата: [100 000 – 150 000 руб./мес]\n' +
                '6. 📞 Контакты: @username\n\n' +
                'Теперь выберите опыт работы:',
                createExperienceKeyboard()
            );
            break;
            
        case NAVIGATION_STEPS.SKILLS:
            const expText = data.experience || 'Не выбрано';
            await ctx.reply(
                `1. ✅ Специализация: ${data.specialization || 'Не выбрано'}\n` +
                `2. ✅ Опыт: ${expText}\n` +
                '3. ⏳ Навыки: [Agile, Kanban]\n' +
                '4. 🎯 Достижение: "Увеличил прибыль проекта на 30% за полгода."\n' +
                '5. 💰 Зарплата: [100 000 – 150 000 руб./мес]\n' +
                '6. 📞 Контакты: @username\n\n' +
                'Теперь выберите навыки:',
                createSkillsKeyboardWithSelected(data.skills || [])
            );
            break;
            
        case NAVIGATION_STEPS.ACHIEVEMENTS:
            const skillsText = data.skills && data.skills.length > 0 ? data.skills.join(', ') : 'Не выбрано';
            
            // Инициализируем поле achievements, если оно не существует
            if (data.achievements === undefined) {
                profileData.get(userId).achievements = undefined;
            }
            
            // Если достижения уже заполнены (не undefined и не null), сразу переходим к зарплате
            if (data.achievements !== undefined && data.achievements !== null) {
                setCurrentStep(userId, NAVIGATION_STEPS.SALARY);
                await showCurrentStep(ctx, NAVIGATION_STEPS.SALARY);
                break;
            }
            // Если явно пропущено (null), тоже переходим к зарплате
            if (data.achievements === null) {
                setCurrentStep(userId, NAVIGATION_STEPS.SALARY);
                await showCurrentStep(ctx, NAVIGATION_STEPS.SALARY);
                break;
            }
            
            await ctx.reply(
                `🏗 Шаг 4/6: Достижения\n\n` +
                `1. ✅ Специализация: ${data.specialization || 'Не выбрано'}\n` +
                `2. ✅ Опыт: ${data.experience || 'Не выбрано'}\n` +
                `3. ✅ Навыки: ${skillsText}\n` +
                '4. ⏳ Достижение: "Увеличил прибыль проекта на 30% за полгода."\n' +
                '5. 💰 Зарплата: [100 000 – 150 000 руб./мес]\n' +
                '6. 📞 Контакты: @username\n\n' +
                '*Хотите добавить достижения?*',
                {
                    parse_mode: 'Markdown',
                    reply_markup: createOptionalKeyboard('achievements').reply_markup
                }
            );
            break;
            
        case NAVIGATION_STEPS.SALARY:
            const achievementsText = data.achievements || 'Не указано';

            // Инициализируем поле salary_range, если оно не существует
            if (data.salary_range === undefined) {
                profileData.get(userId).salary_range = undefined;
            }

            // Если зарплата уже заполнена (не undefined и не null), сразу переходим к контактам
            if (data.salary_range !== undefined && data.salary_range !== null) {
                setCurrentStep(userId, NAVIGATION_STEPS.CONTACTS);
                await showCurrentStep(ctx, NAVIGATION_STEPS.CONTACTS);
                break;
            }

            // Проверяем, были ли достижения пропущены
            const achievementsStatus = ctx.session?.skippedSteps?.achievements ? 'Не указано' : achievementsText;

            await ctx.reply(
                `🏗 Шаг 5/6: Зарплатные ожидания\n\n` +
                `1. ✅ Специализация: ${data.specialization || 'Не выбрано'}\n` +
                `2. ✅ Опыт: ${data.experience || 'Не выбрано'}\n` +
                `3. ✅ Навыки: ${data.skills && data.skills.length > 0 ? data.skills.join(', ') : 'Не выбрано'}\n` +
                `4. ✅ Достижения: ${achievementsStatus}\n` +
                '5. ⏳ Зарплата: [100 000 – 150 000 руб./мес]\n' +
                '6. 📞 Контакты: @username\n\n' +
                '*Выберите зарплатный диапазон или введите вручную:*',
                createSalaryKeyboard()
            );
            break;
            
        case NAVIGATION_STEPS.CONTACTS:
            const salaryText = data.salary_range || 'Не указано';
            
            // Инициализируем поле contacts, если оно не существует
            if (data.contacts === undefined) {
                profileData.get(userId).contacts = undefined;
            }
            
            // Проверяем, были ли достижения и зарплата пропущены
            const achievementsStatusFinal = ctx.session?.skippedSteps?.achievements ? 'Не указано' : (data.achievements || 'Не указано');
            const salaryStatusFinal = ctx.session?.skippedSteps?.salary ? 'Не указано' : salaryText;
            
            await ctx.reply(
                `🏗 Шаг 6/6: Контактная информация\n\n` +
                `1. ✅ Специализация: ${data.specialization || 'Не выбрано'}\n` +
                `2. ✅ Опыт: ${data.experience || 'Не выбрано'}\n` +
                `3. ✅ Навыки: ${data.skills && data.skills.length > 0 ? data.skills.join(', ') : 'Не выбрано'}\n` +
                `4. ✅ Достижения: ${achievementsStatusFinal}\n` +
                `5. ✅ Зарплата: ${salaryStatusFinal}\n` +
                '6. ⏳ Контакты: @username\n\n' +
                '*Хотите указать контактную информацию?*',
                {
                    parse_mode: 'Markdown',
                    reply_markup: createOptionalKeyboard('contacts').reply_markup
                }
            );
            break;
    }
}

// Обработчики для уникальных callback'ов кнопки "Добавить"
async function handleFillAchievements(ctx) {
    ctx.session = {
        ...ctx.session,
        profileState: PROFILE_STATES.ACHIEVEMENTS,
        waitingForAchievementsInput: true
    };
    await ctx.reply('Введите ваши достижения (например: "Увеличил прибыль проекта на 30% за полгода"):');
    await ctx.answerCbQuery();
}

async function handleFillSalary(ctx) {
    ctx.session = {
        ...ctx.session,
        profileState: PROFILE_STATES.SALARY,
        waitingForSalaryInput: true
    };
    await ctx.reply(
        'Введите зарплатные ожидания. Примеры:\n' +
        '• от 120 тыс руб\n' +
        '• 150 000 руб\n' +
        '• $2000\n' +
        '• 100 000 - 150 000 руб'
    );
    await ctx.answerCbQuery();
}

async function handleFillContacts(ctx) {
    ctx.session = {
        ...ctx.session,
        profileState: PROFILE_STATES.CONTACTS,
        waitingForContactsInput: true
    };
    await ctx.reply('Введите контактную информацию (например, @username или моб. номер):');
    await ctx.answerCbQuery();
}

// --- Новый двухуровневый интерфейс редактирования профиля ---

// Главное меню выбора режима редактирования
async function showEditProfileMenu(ctx) {
    await ctx.reply(
        '✏️ <b>Выберите тип редактирования:</b>',
        {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [ { text: '1. Изменить одно поле', callback_data: 'edit_one_field' } ],
                    [ { text: '2. Перезаполнить весь профиль', callback_data: 'edit_full_profile' } ],
                    [ { text: '3. Отмена', callback_data: 'edit_cancel' } ]
                ]
            }
        }
    );
}

// Показываем список полей для редактирования одного поля
async function showEditFieldList(ctx, user) {
    let skills = user.skills;
    if (Array.isArray(skills)) skills = skills.join(', ');
    if (!skills) skills = '';
    await ctx.reply(
        `<b>Ваш профиль:</b>\n\n` +
        `1. Специализация: <b>${user.specialization || '—'}</b>\n` +
        `2. Опыт: <b>${user.experience || '—'}</b>\n` +
        `3. Навыки: <b>${skills || '—'}</b>\n` +
        `4. Зарплата: <b>${user.salary_range || '—'}</b>\n` +
        `5. Контакты: <b>${user.contacts || '—'}</b>\n` +
        `\nВведите номер поля для изменения (1-5):`,
        { parse_mode: 'HTML' }
    );
    ctx.session = ctx.session || {};
    ctx.session.editProfileMode = 'one_field';
}

// Обработка выбора поля для редактирования
async function handleEditFieldInput(ctx, user) {
    const num = (ctx.message.text || '').trim();
    ctx.session = ctx.session || {};
    let field = null;
    if (num === '1') field = 'specialization';
    if (num === '2') field = 'experience';
    if (num === '3') field = 'skills';
    if (num === '4') field = 'salary_range';
    if (num === '5') field = 'contacts';
    if (!field) {
        await ctx.reply('❌ Введите номер поля от 1 до 5.');
        return;
    }
    ctx.session.editProfileField = field;
    // Запрашиваем новое значение
    let prompt = '';
    if (field === 'specialization') prompt = 'Введите новую специализацию:';
    if (field === 'experience') prompt = 'Введите новый опыт:';
    if (field === 'skills') prompt = 'Введите новые навыки через запятую:';
    if (field === 'salary_range') prompt = 'Введите новую зарплату:';
    if (field === 'contacts') prompt = 'Введите новые контакты:';
    await ctx.reply(prompt);
}

// Обработка ввода нового значения для выбранного поля
async function handleEditFieldValue(ctx, user) {
    const field = ctx.session.editProfileField;
    let value = ctx.message.text.trim();
    
    // Валидация поля
    const validation = validateProfileField(field, value);
    if (!validation.isValid) {
        const counter = formatFieldCounter(field, value);
        await ctx.reply(`${validation.error}${counter}\n\nПопробуйте еще раз:`);
        return;
    }
    
    if (field === 'skills') {
        value = value.split(',').map(s => s.trim()).filter(Boolean);
    }
    
    await User.updateProfileField(user.telegram_id, field, value);
    await ctx.reply('✅ Профиль обновлен!');
    ctx.session.editProfileMode = null;
    ctx.session.editProfileField = null;
}

module.exports = {
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
    getCurrentStep,
    setCurrentStep,
    goToPreviousStep,
    goToNextStep,
    showCurrentStep,
    handleFillAchievements,
    handleFillSalary,
    handleFillContacts,
    showEditProfileMenu,
    showEditFieldList,
    handleEditFieldInput,
    handleEditFieldValue
};