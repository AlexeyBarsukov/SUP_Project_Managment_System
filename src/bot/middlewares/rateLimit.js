const redis = require('redis');
const Project = require('../../db/models/Project');

// Создаем клиент Redis
const redisClient = redis.createClient({
    url: process.env.REDIS_URL
});

redisClient.on('error', (err) => {
    console.error('Redis Client Error:', err);
});

redisClient.on('connect', () => {
    console.log('Connected to Redis');
});

// Явное подключение к Redis (однократно при первом импорте)
(async () => {
    try {
        if (!redisClient.isOpen) {
            await redisClient.connect();
        }
    } catch (err) {
        console.error('Ошибка подключения к Redis:', err);
    }
})();

const rateLimit = (maxRequests = 5, windowMs = 86400) => {
    return async (ctx, next) => {
        try {
            const userId = ctx.from.id;
            const key = `rate_limit:${userId}`;
            
            // Увеличиваем счетчик запросов
            const requests = await redisClient.incr(key);
            
            // Если это первый запрос, устанавливаем время жизни ключа
            if (requests === 1) {
                await redisClient.expire(key, windowMs);
            }
            
            // Проверяем, не превышен ли лимит
            if (requests > maxRequests) {
                const remainingTime = await redisClient.ttl(key);
                const hours = Math.floor(remainingTime / 3600);
                const minutes = Math.floor((remainingTime % 3600) / 60);
                
                return ctx.reply(
                    `⚠️ Превышен лимит запросов (${maxRequests} в сутки).\n` +
                    `Попробуйте через ${hours}ч ${minutes}м.`,
                    { parse_mode: 'HTML' }
                );
            }
            
            return next();
        } catch (error) {
            console.error('Error in rateLimit middleware:', error);
            // В случае ошибки Redis пропускаем запрос
            return next();
        }
    };
};

// Новый middleware для проверки лимита создания проектов по количеству активных проектов
const createProjectLimit = (maxProjects = 2) => {
    return async (ctx, next) => {
        try {
            console.log('[createProjectLimit] Start - User ID:', ctx.from?.id);
            
            if (!ctx.user) {
                console.log('[createProjectLimit] User not found in ctx, searching by telegram_id');
                ctx.user = await require('../../db/models/User').findByTelegramId(ctx.from.id);
            }
            
            if (!ctx.user) {
                console.log('[createProjectLimit] User not found in database');
                return ctx.reply('❌ Пользователь не найден. Используйте /start');
            }
            
            console.log('[createProjectLimit] User found:', ctx.user.id, 'Role:', ctx.user.main_role);
            
            // Получаем количество активных проектов пользователя
            const userProjects = await Project.findByCustomerId(ctx.user.id);
            const activeProjectsCount = userProjects.length;
            
            console.log(`[createProjectLimit] User ${ctx.user.id} has ${activeProjectsCount} active projects`);
            
            if (activeProjectsCount >= maxProjects) {
                console.log(`[createProjectLimit] Limit reached: ${activeProjectsCount}/${maxProjects}`);
                return ctx.reply(
                    `⚠️ <b>Лимит создания проектов</b>\n\n` +
                    `У вас уже создано ${activeProjectsCount} проекта.\n` +
                    `Максимальное количество проектов: ${maxProjects}\n\n` +
                    `Для создания нового проекта удалите один из существующих проектов.`,
                    { parse_mode: 'HTML' }
                );
            }
            
            console.log(`[createProjectLimit] Limit check passed, calling next()`);
            return next();
        } catch (error) {
            console.error('[createProjectLimit] Error:', error);
            return ctx.reply('❌ Произошла ошибка при проверке лимита проектов');
        }
    };
};

// Специальный rate limit для запросов на присоединение к проектам
const joinProjectRateLimit = rateLimit(3, 86400); // 3 запроса в сутки

// Rate limit для обычных команд
const standardRateLimit = rateLimit(10, 3600); // 10 запросов в час

module.exports = {
    rateLimit,
    joinProjectRateLimit,
    createProjectLimit,
    standardRateLimit,
    redisClient
}; 