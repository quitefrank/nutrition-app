import { readFileSync } from "fs";
import { join } from "path";
import { describe, it, expect } from "vitest";

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf-8");
const layout = readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf-8");

describe("App shell", () => {
  it("defines .app-shell with max-width: 430px", () => {
    expect(css).toContain(".app-shell");
    expect(css).toContain("max-width: 430px");
  });
  it("defines .screen-content with safe-area padding", () => {
    expect(css).toContain(".screen-content");
    expect(css).toContain("safe-area-inset-bottom");
  });
  it("defines .nav-bar-container", () => {
    expect(css).toContain(".nav-bar-container");
  });
  it("has a narrow-viewport grid collapse rule", () => {
    expect(css).toContain("max-width: 359px");
    expect(css).toContain("collection-grid");
  });
  it("layout.tsx uses app-shell class", () => {
    expect(layout).toContain("app-shell");
  });
});
