import { env } from '../config/env.ts'
import {
  PG_POOL_MAX,
  PG_IDLE_TIMEOUT_MS,
  PG_CONNECTION_TIMEOUT_MS,
  SLOW_QUERY_THRESHOLD_MS,
  CIRCUIT_BREAKER_THRESHOLD,
  CIRCUIT_BREAKER_RESET_MS,
} from '../config/constants.ts'

import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './generated/prisma/client.ts'
import { CircuitBreaker, isConnectionError } from './circuit-breaker.ts'

const connectionString = `${env.DATABASE_URL}`

const adapter = new PrismaPg({
  connectionString,
  max: PG_POOL_MAX,
  idleTimeoutMillis: PG_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: PG_CONNECTION_TIMEOUT_MS,
})
const basePrisma = new PrismaClient({ adapter })

const pgCircuitBreaker = new CircuitBreaker(CIRCUIT_BREAKER_THRESHOLD, CIRCUIT_BREAKER_RESET_MS);

export { pgCircuitBreaker };

export const prisma = basePrisma.$extends({
  query: {
    $allOperations({ operation, model, args, query }) {
      if (pgCircuitBreaker.isOpen) {
        return Promise.reject(
          new Error("Database circuit breaker is OPEN — requests temporarily blocked. Retry shortly."),
        );
      }

      const start = performance.now();
      return query(args)
        .then((result: any) => {
          pgCircuitBreaker.recordSuccess();
          const duration = performance.now() - start;
          if (duration > SLOW_QUERY_THRESHOLD_MS) {
            console.warn(
              `[SLOW-QUERY] ${model}.${operation} levou ${duration.toFixed(0)}ms`,
            );
          }
          return result;
        })
        .catch((err: any) => {
          if (isConnectionError(err)) {
            pgCircuitBreaker.recordFailure();
          }
          throw err;
        });
    },
  },
});
