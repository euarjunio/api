import { redis } from "./redis.ts";

interface ShutdownTask {
  name: string;
  close: () => Promise<void>;
}

/**
 * Registra graceful shutdown genérico.
 * Recebe uma lista de tarefas (nome + função close) que serão
 * executadas em ordem antes de desconectar o Redis e encerrar o processo.
 *
 * Usado tanto pelo server HTTP quanto pelo worker de filas.
 */
export function registerShutdown(label: string, tasks: ShutdownTask[]) {
  async function gracefulShutdown(signal: string) {
    console.log(`\n⏳ [${label}] Recebido ${signal} — encerrando...`);

    try {
      for (const task of tasks) {
        await task.close();
        console.log(`✅ [${label}] ${task.name} fechado`);
      }

      await redis.quit();
      console.log(`✅ [${label}] Redis desconectado`);

      console.log(`👋 [${label}] Encerrado com sucesso`);
      process.exit(0);
    } catch (err) {
      console.error(`❌ [${label}] Erro ao encerrar:`, err);
      process.exit(1);
    }
  }

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
}
