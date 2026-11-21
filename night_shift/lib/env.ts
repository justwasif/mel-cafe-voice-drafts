import { z } from "zod";

const envSchema = z.object({
  GEMINI_API_KEY: z.string().min(1),
  GEMINI_MODEL: z.string().min(1),
  SLACK_BOT_TOKEN: z.string().min(1),
  SLACK_DIGEST_CHANNEL: z.string().min(1).default("night-digest"),
  SENTRY_AUTH_TOKEN: z.string().min(1),
  SENTRY_ORG: z.string().default(""),
  SENTRY_PROJECT: z.string().default(""),
  SENTRY_DSN: z.string().default(""),
  APP_PASSWORD: z.string().min(1),
  SESSION_SECRET: z.string().min(16),
  APP_URL: z.string().url().default("http://localhost:3008"),
  APP_TIMEZONE: z.string().default("UTC"),
  NIGHT_RUN_TIME: z.string().regex(/^\d{2}:\d{2}$/, "NIGHT_RUN_TIME must be HH:mm").default("02:00"),
});

export const env = envSchema.parse(process.env);
