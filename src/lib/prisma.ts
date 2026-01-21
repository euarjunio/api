import { env } from '../config/env.ts'

import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './generated/prisma/client.js'

const connectionString = `${env.DATABASE_URL}`

const adapter = new PrismaPg({ connectionString })
export const prisma = new PrismaClient({ adapter })