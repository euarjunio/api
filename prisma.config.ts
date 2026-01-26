import 'dotenv/config'
import { defineConfig } from 'prisma/config'
import { env } from './src/config/env.ts'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env.DATABASE_URL || 'postgresql://neondb_owner:npg_aXnZRm8Oe0YQ@ep-super-resonance-acbw5n3b-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
  },
})
