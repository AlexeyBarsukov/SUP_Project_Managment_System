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
    const validStatuses = ['draft', 'active', 'archived'];
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

module.exports = {
    validateProjectName,
    validateProjectDescription,
    validateProjectId,
    validateRole,
    validateProjectStatus,
    validateTelegramId,
    validateUsername,
    validateName,
    validateProject
}; 