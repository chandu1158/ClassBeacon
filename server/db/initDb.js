import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

export async function initDatabase() {
  console.log('⚡ Connecting to XAMPP MySQL on 127.0.0.1:3306…');

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
  });

  const schemaPath = path.resolve(import.meta.dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  console.log('📜 Executing schema initialization…');
  await connection.query(sql);
  console.log('✅ MySQL Database classbeacon_db created and initialized successfully!');
  await connection.end();
}

if (process.argv[1] && process.argv[1].endsWith('initDb.js')) {
  initDatabase().catch((err) => {
    console.error('❌ DB Initialization Failed:', err);
    process.exit(1);
  });
}
