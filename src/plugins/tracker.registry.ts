import type { TrackerPlugin } from "./tracker.interface.ts";
import { UtmifyPlugin } from "./utmify/index.ts";
import { MetaPixelPlugin } from "./meta-pixel/index.ts";

// ── Registry de plugins de tracking ─────────────────────────────────

const plugins = new Map<string, TrackerPlugin>();

plugins.set("utmify", new UtmifyPlugin());
plugins.set("meta_pixel", new MetaPixelPlugin());

/** Retorna um plugin pelo nome (ou undefined se não existir). */
export function getPlugin(name: string): TrackerPlugin | undefined {
  return plugins.get(name);
}

/** Lista nomes de todos os plugins disponíveis. */
export function getAllPluginNames(): string[] {
  return Array.from(plugins.keys());
}
