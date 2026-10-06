import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

export const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

pool.on('connect', () => {
  console.log('⚡ [Database]: PostgreSQL connected successfully.');
});

pool.on('error', (err) => {
  console.error('❌ [Database Error]: Unexpected database error', err);
  process.exit(-1);
});