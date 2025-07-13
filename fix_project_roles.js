require('dotenv').config();
const ProjectRole = require('./src/db/models/ProjectRole');

async function fixProjectRoles() {
    try {
        console.log('🔧 Синхронизация filled_positions...');
        const fixedCount = await ProjectRole.fixFilledPositions();
        console.log(`✅ Исправлено ${fixedCount} записей в project_roles`);
        console.log('Готово!');
    } catch (error) {
        console.error('❌ Ошибка при синхронизации:', error.message);
    }
}

fixProjectRoles(); 