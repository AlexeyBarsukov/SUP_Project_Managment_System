// Валидация названия проекта
const validateProjectName = (projectName) => {
    if (!projectName || typeof projectName !== 'string') {
        return { isValid: false, error: 'Название проекта обязательно' };
    }
    
    if (projectName.length < 3) {
        return { isValid: false, error: 'Название проекта должно содержать минимум 3 символа' };
    }
    
    if (projectName.length > 100) {
        return { isValid: false, error: 'Название проекта не должно превышать 100 символов' };
    }
    
    if (projectName.trim().length === 0) {
        return { isValid: false, error: 'Название проекта не может быть пустым' };
    }
    
    return { isValid: true };
};

// Валидация описания проекта
const validateProjectDescription = (description) => {
    if (!description || typeof description !== 'string') {
        return { isValid: false, error: 'Описание проекта обязательно' };
    }
    
    if (description.length > 2000) {
        return { isValid: false, error: 'Описание проекта не должно превышать 2000 символов' };
    }
    
    if (description.trim().length === 0) {
        return { isValid: false, error: 'Описание проекта не может быть пустым' };
    }
    
    return { isValid: true };
};

// Валидация ID проекта
const validateProjectId = (id) => {
    const numId = parseInt(id);
    if (isNaN(numId) || numId <= 0) {
        return { isValid: false, error: 'Неверный ID проекта' };
    }
    return { isValid: true, id: numId };
};

// Валидация роли пользователя
const validateRole = (role) => {
    const validRoles = ['customer', 'manager', 'executor'];
    if (!validRoles.includes(role)) {
        return { isValid: false, error: 'Неверная роль пользователя' };
    }
    return { isValid: true };
};

// Валидация статуса проекта
const validateProjectStatus = (status) => {
    const validStatuses = ['draft', 'active', 'archived', 'searching_manager', 'searching_executors', 'in_progress'];
    if (!validStatuses.includes(status)) {
        return { isValid: false, error: 'Неверный статус проекта' };
    }
    return { isValid: true };
};

// Валидация Telegram ID
const validateTelegramId = (id) => {
    const numId = parseInt(id);
    if (isNaN(numId) || numId <= 0) {
        return { isValid: false, error: 'Неверный Telegram ID' };
    }
    return { isValid: true, id: numId };
};

// Валидация имени пользователя
const validateUsername = (username) => {
    if (!username) {
        return { isValid: true }; // username может быть null
    }
    
    if (typeof username !== 'string') {
        return { isValid: false, error: 'Неверный формат имени пользователя' };
    }
    
    if (username.length > 100) {
        return { isValid: false, error: 'Имя пользователя слишком длинное' };
    }
    
    // Проверка на допустимые символы
    const usernameRegex = /^[a-zA-Z0-9_]{5,32}$/;
    if (!usernameRegex.test(username)) {
        return { isValid: false, error: 'Имя пользователя содержит недопустимые символы' };
    }
    
    return { isValid: true };
};

// Валидация имени и фамилии
const validateName = (name) => {
    if (!name || typeof name !== 'string') {
        return { isValid: false, error: 'Имя обязательно' };
    }
    
    if (name.length > 100) {
        return { isValid: false, error: 'Имя слишком длинное' };
    }
    
    if (name.trim().length === 0) {
        return { isValid: false, error: 'Имя не может быть пустым' };
    }
    
    return { isValid: true };
};

// Общая функция валидации проекта
const validateProject = (projectName, description) => {
    const nameValidation = validateProjectName(projectName);
    if (!nameValidation.isValid) {
        return nameValidation;
    }
    
    const descriptionValidation = validateProjectDescription(description);
    if (!descriptionValidation.isValid) {
        return descriptionValidation;
    }
    
    return { isValid: true };
};

// Константы валидации профиля менеджера
const PROFILE_VALIDATION = {
    SPECIALIZATION: {
        maxLength: 300,
        pattern: /^[а-яёa-z0-9\s,.-]+$/i,
        example: "IT-проекты, управление"
    },
    EXPERIENCE: {
        maxLength: 300,
        pattern: /^[а-яёa-z0-9\s,.-]+$/i,
        example: "3+ года в fintech"
    },
    SKILLS: {
        maxLength: 300,
        pattern: /^[а-яёa-z0-9\s,.-]+$/i,
        example: "Jira, Scrum, Python"
    },
    SALARY_RANGE: {
        maxLength: 50,
        pattern: /^[а-яёa-z0-9\s,.-–—()]+$/i,
        example: "от 50 000 руб."
    },
    CONTACTS: {
        maxLength: 100,
        pattern: /^[@a-zA-Z0-9_+\-()\s]+$/,
        example: "@username или +79041234567"
    },
    ACHIEVEMENTS: {
        maxLength: 300,
        example: 'Увеличил прибыль проекта на 30% за полгода'
    }
};

/**
 * Валидирует поле профиля менеджера
 * @param {string} field - название поля
 * @param {string} value - значение для проверки
 * @returns {object} {isValid: boolean, error: string|null, remaining: number}
 */
function validateProfileField(field, value) {
    const config = PROFILE_VALIDATION[field.toUpperCase()];
    if (!config) {
        return { isValid: false, error: 'Неизвестное поле профиля', remaining: 0 };
    }

    const length = value.length;
    const remaining = config.maxLength - length;

    // Проверка длины
    if (length > config.maxLength) {
        return {
            isValid: false,
            error: `❌ Превышен лимит (${length}/${config.maxLength})`,
            remaining: 0
        };
    }

    // Проверка формата (если есть паттерн)
    if (config.pattern && !config.pattern.test(value)) {
        return {
            isValid: false,
            error: `❌ Некорректный формат. Пример: ${config.example}`,
            remaining
        };
    }

    return { isValid: true, error: null, remaining };
}

/**
 * Форматирует сообщение с счетчиком символов
 * @param {string} field - название поля
 * @param {string} value - текущее значение
 * @returns {string} отформатированное сообщение
 */
function formatFieldCounter(field, value) {
    const config = PROFILE_VALIDATION[field.toUpperCase()];
    if (!config) return '';

    const length = value.length;
    const remaining = config.maxLength - length;
    const percentage = Math.round((length / config.maxLength) * 100);
    
    let status = '✅';
    if (percentage > 90) status = '⚠️';
    if (percentage > 100) status = '❌';
    
    return `\n${status} ${length}/${config.maxLength} символов`;
}

/**
 * Проверяет, можно ли сохранить профиль
 * @param {object} profileData - данные профиля
 * @returns {object} {canSave: boolean, errors: array}
 */
function validateProfileData(profileData) {
    const errors = [];
    
    // Обязательные поля
    const requiredFields = ['specialization', 'experience', 'skills', 'salary_range', 'contacts'];
    
    for (const field of requiredFields) {
        if (!profileData[field]) {
            errors.push(`${field}: Обязательное поле`);
            continue;
        }
        
        const validation = validateProfileField(field, profileData[field]);
        if (!validation.isValid) {
            errors.push(`${field}: ${validation.error}`);
        }
    }
    
    // Опциональные поля (проверяем только если заполнены)
    const optionalFields = ['achievements'];
    
    for (const field of optionalFields) {
        if (profileData[field]) {
            const validation = validateProfileField(field, profileData[field]);
            if (!validation.isValid) {
                errors.push(`${field}: ${validation.error}`);
            }
        }
    }
    
    return {
        canSave: errors.length === 0,
        errors
    };
}

module.exports = {
    validateProjectName,
    validateProjectDescription,
    validateProjectId,
    validateRole,
    validateProjectStatus,
    validateTelegramId,
    validateUsername,
    validateName,
    validateProject,
    PROFILE_VALIDATION,
    validateProfileField,
    formatFieldCounter,
    validateProfileData
}; 