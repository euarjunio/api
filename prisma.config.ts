import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_aXnZRm8Oe0YQ@ep-super-resonance-acbw5n3b-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
  },
})
