const { Pool } = require('pg');
const pool = new Pool({
    host: 'localhost',
    port: 5432,
    database: 'project_management',
    user: 'postgres',
    password: 'password'
});

async function checkDatabaseStructure() {
    console.log('🔍 Проверяем структуру базы данных...\n');
    
    try {
        const client = await pool.connect();
        
        // Получаем список всех таблиц
        console.log('📋 Список всех таблиц в базе данных:');
        const tablesQuery = `
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_type = 'BASE TABLE'
            ORDER BY table_name
        `;
        const tablesResult = await client.query(tablesQuery);
        
        if (tablesResult.rows.length === 0) {
            console.log('❌ Таблицы не найдены');
            return;
        }
        
        tablesResult.rows.forEach((row, index) => {
            console.log(`${index + 1}. ${row.table_name}`);
        });
        
        // Получаем список всех последовательностей
        console.log('\n📊 Список всех последовательностей (автоинкременты):');
        const sequencesQuery = `
            SELECT sequence_name 
            FROM information_schema.sequences 
            WHERE sequence_schema = 'public'
            ORDER BY sequence_name
        `;
        const sequencesResult = await client.query(sequencesQuery);
        
        if (sequencesResult.rows.length === 0) {
            console.log('❌ Последовательности не найдены');
        } else {
            sequencesResult.rows.forEach((row, index) => {
                console.log(`${index + 1}. ${row.sequence_name}`);
            });
        }
        
        // Проверяем количество записей в каждой таблице
        console.log('\n📈 Количество записей в таблицах:');
        for (const tableRow of tablesResult.rows) {
            const tableName = tableRow.table_name;
            try {
                const countQuery = `SELECT COUNT(*) as count FROM "${tableName}"`;
                const countResult = await client.query(countQuery);
                const count = parseInt(countResult.rows[0].count);
                console.log(`📊 ${tableName}: ${count} записей`);
            } catch (error) {
                console.log(`❌ ${tableName}: ошибка при подсчете - ${error.message}`);
            }
        }
        
        // Показываем структуру основных таблиц
        console.log('\n🏗️ Структура основных таблиц:');
        const mainTables = ['users', 'projects', 'project_members', 'project_managers'];
        
        for (const tableName of mainTables) {
            if (tablesResult.rows.some(row => row.table_name === tableName)) {
                console.log(`\n📋 Структура таблицы ${tableName}:`);
                const columnsQuery = `
                    SELECT column_name, data_type, is_nullable, column_default
                    FROM information_schema.columns 
                    WHERE table_name = $1 
                    ORDER BY ordinal_position
                `;
                const columnsResult = await client.query(columnsQuery, [tableName]);
                
                columnsResult.rows.forEach(col => {
                    const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
                    const defaultValue = col.column_default ? ` DEFAULT ${col.column_default}` : '';
                    console.log(`  ${col.column_name}: ${col.data_type} ${nullable}${defaultValue}`);
                });
            }
        }
        
    } catch (error) {
        console.error('❌ Ошибка при проверке структуры БД:', error);
        console.error('Stack trace:', error.stack);
    } finally {
        await pool.end();
    }
}

checkDatabaseStructure(); 