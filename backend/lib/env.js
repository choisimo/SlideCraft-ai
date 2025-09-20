// Environment loader
import { config } from 'dotenv';
config();
export const ENV = {
  PORT: Number(process.env.BACKEND_PORT || 8787),
  NODE_ENV: process.env.NODE_ENV || 'development',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-4o-mini'
};
