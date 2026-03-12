import { z } from 'zod';

const optionalSecret = (name: string) =>
  z
    .string()
    .optional()
    .refine(value => value === undefined || value.length >= 32, {
      message: `${name} 必須至少 32 字元`
    });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .default('5000'),
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL 不可為空')
    .refine(value => /^postgres(ql)?:\/\//.test(value), {
      message: 'DATABASE_URL 必須是 PostgreSQL 連線字串'
    }),
  USE_SUPABASE: z.enum(['true', 'false']).optional(),
  ALLOWED_ORIGINS: z.string().optional(),
  TRUST_PROXY: z.enum(['true', 'false']).optional(),
  SESSION_SECRET: optionalSecret('SESSION_SECRET'),
  ENCRYPTION_KEY: optionalSecret('ENCRYPTION_KEY')
});

export type ValidatedEnv = z.infer<typeof envSchema>;

export function validateEnv(): ValidatedEnv {
  const validated = envSchema.parse(process.env);

  if (!validated.SESSION_SECRET) {
    console.warn('SESSION_SECRET 未設定，目前僅使用管理員 PIN 驗證流程');
  }

  if (!validated.ENCRYPTION_KEY) {
    console.warn('ENCRYPTION_KEY 未設定，AES 加密升級前請補齊');
  }

  return validated;
}
