const { Markup } = require('telegraf');
const User = require('../../db/models/User');
const { 
    MANAGER_SPECIALIZATIONS, 
    MANAGER_SKILLS, 
    EXPERIENCE_RANGES, 
    SALARY_RANGES 
} = require('../../utils/constants');
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
    buttons.push([Markup.button.callback('Пропустить', 'skip_optional')]);
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
    if (skills.includes(skill)) {
        skills.splice(skills.indexOf(skill), 1);
    } else {
        skills.push(skill);
    }
    
    const skillsText = skills.length > 0 ? skills.join(', ') : 'Не выбрано';
    
    await ctx.reply(
        `Навыки: ${skillsText}\n\n` +
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

    if (data === 'skip_optional') {
        profileData.get(userId).salary_range = null;
    } else if (data.startsWith('salary_')) {
        // Обработка выбора конкретного диапазона зарплаты
        const salary = data.replace('salary_', '');
        profileData.get(userId).salary_range = salary;
    } else {
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

    // Явно переходим к контактам
    setCurrentStep(userId, NAVIGATION_STEPS.CONTACTS);
    await showCurrentStep(ctx, NAVIGATION_STEPS.CONTACTS);

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

async function saveProfile(ctx) {
    const userId = ctx.from.id;
    const data = profileData.get(userId);
    
    if (!data) {
        await ctx.reply('❌ Ошибка: данные профиля не найдены. Попробуйте заполнить профиль заново.');
        return;
    }
    
    try {
        await User.updateManagerProfile(userId, data);
        
        // Показываем итоговый результат
        const resultText = formatFinalProfile(data);
        
        await ctx.reply(
            resultText,
            Markup.inlineKeyboard([
                [Markup.button.callback('✅ Профиль сохранен!', 'profile_saved')]
            ])
        );
        
        // Очищаем данные
        profileData.delete(userId);
        profileNavigation.delete(userId);
        delete ctx.session.profileState;
        
    } catch (error) {
        console.error('Error saving profile:', error);
        await ctx.reply('❌ Ошибка при сохранении профиля. Попробуйте еще раз.');
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

// Обработчики текстовых сообщений
async function handleTextInput(ctx) {
    if (!ctx.session?.profileState) return;
    
    // Проверяем, не обрабатывали ли мы уже это сообщение
    if (ctx.message.handled) return;
    
    const userId = ctx.from.id;
    const text = ctx.message.text;
    
    // Инициализируем данные профиля, если они не существуют
    if (!profileData.has(userId)) {
        profileData.set(userId, {});
    }
    
    // Помечаем сообщение как обработанное
    ctx.message.handled = true;
    
    switch (ctx.session.profileState) {
        case PROFILE_STATES.SPECIALIZATION:
            if (text.length > 100) {
                await ctx.reply('Специализация слишком длинная. Максимум 100 символов.');
                return;
            }
            profileData.get(userId).specialization = text;
            delete ctx.session.profileState;
            delete ctx.session.waitingForSpecializationInput; // Удаляем флаг
            
            // Явно переходим к опыту
            setCurrentStep(userId, NAVIGATION_STEPS.EXPERIENCE);
            await showCurrentStep(ctx, NAVIGATION_STEPS.EXPERIENCE);
            break;
            
        case PROFILE_STATES.SKILLS:
            if (text.length > 500) {
                await ctx.reply('Список навыков слишком длинный. Максимум 500 символов.');
                return;
            }
            // Добавляем введенные навыки к уже выбранным
            const customSkills = text.split(',').map(s => s.trim()).filter(s => s.length > 0);
            const existingSkills = profileData.get(userId).skills || [];
            profileData.get(userId).skills = [...existingSkills, ...customSkills];
            delete ctx.session.profileState;
            delete ctx.session.waitingForSkillsInput; // Удаляем флаг
            
            // Явно переходим к достижениям
            setCurrentStep(userId, NAVIGATION_STEPS.ACHIEVEMENTS);
            await showCurrentStep(ctx, NAVIGATION_STEPS.ACHIEVEMENTS);
            break;
            
        case PROFILE_STATES.ACHIEVEMENTS:
            if (text.length > 500) {
                await ctx.reply('Описание достижений слишком длинное. Максимум 500 символов.');
                return;
            }
            profileData.get(userId).achievements = text;
            delete ctx.session.profileState;
            delete ctx.session.waitingForAchievementsInput; // Удаляем флаг

            // Явно переходим к зарплате
            setCurrentStep(userId, NAVIGATION_STEPS.SALARY);
            await showCurrentStep(ctx, NAVIGATION_STEPS.SALARY);
            break;
            
        case PROFILE_STATES.SALARY:
            console.log('Processing salary input:', text);
            if (text.length > 100) {
                await ctx.reply('Зарплатные ожидания слишком длинные. Максимум 100 символов.');
                return;
            }
            
            // Валидация формата зарплаты
            const salaryRegex = /^(от\s)?(\d+\s?[тыс.]*\s?руб|\$?\d+|\d+\s*-\s*\d+\s*руб)/i;
            if (!salaryRegex.test(text)) {
                await ctx.reply('Пожалуйста, укажите зарплату в формате: "от 120 тыс руб" или "150 000 руб"');
                return;
            }
            
            profileData.get(userId).salary_range = text;
            delete ctx.session.profileState;
            delete ctx.session.waitingForSalaryInput; // Удаляем флаг

            // Явно переходим к контактам
            setCurrentStep(userId, NAVIGATION_STEPS.CONTACTS);
            await showCurrentStep(ctx, NAVIGATION_STEPS.CONTACTS);
            break;
            
        case PROFILE_STATES.CONTACTS:
            if (text.length > 100) {
                await ctx.reply('Контактная информация слишком длинная. Максимум 100 символов.');
                return;
            }
            profileData.get(userId).contacts = text;
            delete ctx.session.profileState;
            delete ctx.session.waitingForContactsInput; // Удаляем флаг
            
            await saveProfile(ctx);
            break;
    }
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
                profileData.get(userId).achievements = null;
            }
            
            // Если достижения уже заполнены (не null), сразу переходим к зарплате
            if (data.achievements !== null && data.achievements !== undefined) {
                setCurrentStep(userId, NAVIGATION_STEPS.SALARY);
                await showCurrentStep(ctx, NAVIGATION_STEPS.SALARY);
                break;
            }
            
            await ctx.reply(
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
                profileData.get(userId).salary_range = null;
            }

            // Если зарплата уже заполнена (не null), сразу переходим к контактам
            if (data.salary_range !== null && data.salary_range !== undefined) {
                setCurrentStep(userId, NAVIGATION_STEPS.CONTACTS);
                await showCurrentStep(ctx, NAVIGATION_STEPS.CONTACTS);
                break;
            }

            await ctx.reply(
                `1. ✅ Специализация: ${data.specialization || 'Не выбрано'}\n` +
                `2. ✅ Опыт: ${data.experience || 'Не выбрано'}\n` +
                `3. ✅ Навыки: ${data.skills && data.skills.length > 0 ? data.skills.join(', ') : 'Не выбрано'}\n` +
                `4. ✅ Достижения: ${achievementsText}\n` +
                '5. ⏳ Зарплата: [100 000 – 150 000 руб./мес]\n' +
                '6. 📞 Контакты: @username\n\n' +
                '*Хотите указать зарплатные ожидания?*',
                createOptionalKeyboard('salary')
            );
            break;
            
        case NAVIGATION_STEPS.CONTACTS:
            const salaryText = data.salary_range || 'Не указано';
            
            // Инициализируем поле contacts, если оно не существует
            if (data.contacts === undefined) {
                profileData.get(userId).contacts = null;
            }
            
            await ctx.reply(
                `1. ✅ Специализация: ${data.specialization || 'Не выбрано'}\n` +
                `2. ✅ Опыт: ${data.experience || 'Не выбрано'}\n` +
                `3. ✅ Навыки: ${data.skills && data.skills.length > 0 ? data.skills.join(', ') : 'Не выбрано'}\n` +
                `4. ✅ Достижения: ${data.achievements || 'Не указано'}\n` +
                `5. ✅ Зарплата: ${salaryText}\n` +
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
    await ctx.reply('Введите контактную информацию (например, @username):');
    await ctx.answerCbQuery();
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
    handleFillContacts
};