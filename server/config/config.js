import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export const config = {
  // Server
  PORT: process.env.PORT || 5000,
  NODE_ENV: process.env.NODE_ENV || 'development',

  // Security
  JWT_SECRET: process.env.JWT_SECRET || 'stealthlan-default-secret-CHANGE-THIS',
  SALT_ROUNDS: parseInt(process.env.SALT_ROUNDS) || 10,

  // Rate Limiting
  MAX_LOGIN_ATTEMPTS: parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5,
  LOCKOUT_DURATION: parseInt(process.env.LOCKOUT_DURATION_MINUTES) * 60 * 1000 || 5 * 60 * 1000, // Convert to milliseconds

  // CORS
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
    : ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000', 'http://127.0.0.1:5173'],

  // Session
  SESSION_EXPIRY: process.env.SESSION_EXPIRY || '24h',
  TOKEN_EXPIRY: process.env.TOKEN_EXPIRY || '7d',
};

// Validate critical configuration
if (config.JWT_SECRET === 'stealthlan-default-secret-CHANGE-THIS' && config.NODE_ENV === 'production') {
  console.error('❌ CRITICAL: JWT_SECRET must be set in production environment!');
  process.exit(1);
}

if (config.JWT_SECRET.length < 32) {
  console.warn('⚠️  WARNING: JWT_SECRET should be at least 32 characters long for security');
}
