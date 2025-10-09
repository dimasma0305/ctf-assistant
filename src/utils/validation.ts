/**
 * Validation utilities for Discord bot startup
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate Discord bot token format
 */
export function validateToken(token: string | undefined): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!token) {
    errors.push('TOKEN environment variable is not set');
    return { valid: false, errors, warnings };
  }

  if (token.trim() === '') {
    errors.push('TOKEN is empty');
    return { valid: false, errors, warnings };
  }

  // Discord bot tokens typically have 3 parts separated by dots
  const parts = token.split('.');
  if (parts.length !== 3) {
    warnings.push('Token format appears unusual (expected 3 parts separated by dots)');
  }

  // Basic length check
  if (token.length < 50) {
    warnings.push('Token appears to be too short (possible invalid token)');
  }

  // Check for common placeholder values
  const placeholders = ['your_token_here', 'YOUR_TOKEN', 'TOKEN', 'xxx', 'test'];
  if (placeholders.some(placeholder => token.toLowerCase().includes(placeholder.toLowerCase()))) {
    errors.push('Token appears to be a placeholder value');
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate required environment variables
 */
export function validateEnvironment(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check TOKEN
  const tokenValidation = validateToken(process.env.TOKEN);
  errors.push(...tokenValidation.errors);
  warnings.push(...tokenValidation.warnings);

  // Check other optional but recommended variables
  if (!process.env.NODE_ENV) {
    warnings.push('NODE_ENV is not set (defaulting to development)');
  }

  // Check database connection if not NODB mode
  if (!process.env.NODB) {
    if (!process.env.MONGODB_URI && !process.env.DATABASE_URL) {
      warnings.push('No MongoDB connection string found (MONGODB_URI or DATABASE_URL)');
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate Discord intents configuration
 */
export function validateIntents(intents: number[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!intents || intents.length === 0) {
    errors.push('No intents configured');
    return { valid: false, errors, warnings };
  }

  // Check for common required intents
  const hasGuilds = intents.some(i => i === 1); // GatewayIntentBits.Guilds = 1 << 0
  if (!hasGuilds) {
    warnings.push('Guilds intent not enabled (may cause issues)');
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Run all startup validations
 */
export function runStartupValidation(): boolean {
  console.log('🔍 Running startup validation...');
  
  const envValidation = validateEnvironment();
  
  // Log errors
  if (envValidation.errors.length > 0) {
    console.error('❌ Validation errors:');
    envValidation.errors.forEach(error => console.error(`   - ${error}`));
  }
  
  // Log warnings
  if (envValidation.warnings.length > 0) {
    console.warn('⚠️  Validation warnings:');
    envValidation.warnings.forEach(warning => console.warn(`   - ${warning}`));
  }
  
  if (envValidation.valid) {
    console.log('✅ Startup validation passed');
  } else {
    console.error('❌ Startup validation failed');
  }
  
  return envValidation.valid;
}

/**
 * Check if token has necessary permissions (basic check)
 */
export function checkTokenPermissions(token: string): { botId: string | null; error: string | null } {
  try {
    // Discord tokens are base64 encoded with bot ID in first part
    const parts = token.split('.');
    if (parts.length < 1) {
      return { botId: null, error: 'Invalid token format' };
    }
    
    // Decode the first part to get bot ID
    const botId = Buffer.from(parts[0], 'base64').toString('utf-8');
    
    // Basic validation that it's a snowflake ID
    if (!/^\d{17,19}$/.test(botId)) {
      return { botId: null, error: 'Could not extract valid bot ID from token' };
    }
    
    return { botId, error: null };
  } catch (error) {
    return { botId: null, error: 'Failed to decode token' };
  }
}

/**
 * Validate bot configuration before startup
 */
export function validateBotConfig(config: {
  token?: string;
  intents?: number[];
  partials?: number[];
}): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate token
  const tokenValidation = validateToken(config.token);
  errors.push(...tokenValidation.errors);
  warnings.push(...tokenValidation.warnings);

  // Validate intents
  if (config.intents) {
    const intentsValidation = validateIntents(config.intents);
    errors.push(...intentsValidation.errors);
    warnings.push(...intentsValidation.warnings);
  } else {
    errors.push('No intents configured');
  }

  // Check for bot ID in token
  if (config.token) {
    const tokenCheck = checkTokenPermissions(config.token);
    if (tokenCheck.error) {
      warnings.push(tokenCheck.error);
    } else if (tokenCheck.botId) {
      console.log(`ℹ️  Bot ID extracted from token: ${tokenCheck.botId}`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

