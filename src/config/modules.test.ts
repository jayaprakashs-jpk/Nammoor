import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { MODULES } from "./modules";

describe("module registry", () => {
  it("has unique ids and routes", () => {
    expect(new Set(MODULES.map((m) => m.id)).size).toBe(MODULES.length);
    expect(new Set(MODULES.map((m) => m.route)).size).toBe(MODULES.length);
  });

  it("every enabled module has a route page", () => {
    for (const m of MODULES.filter((x) => x.enabled)) {
      const page = join(process.cwd(), "src/app", m.route, "page.tsx");
      expect(existsSync(page), `${m.id} -> ${page}`).toBe(true);
    }
  });
});
