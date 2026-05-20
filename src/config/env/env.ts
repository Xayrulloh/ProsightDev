import { registerAs } from '@nestjs/config';
import { envSchema } from './env-validation';

export const env = registerAs('env', () => envSchema.parse(process.env));

export const checkedEnv = env();
