import { readFileSync } from "fs";
import { join } from "path";
import { describe, it, expect } from "vitest";

const css = readFileSync(
  join(process.cwd(), "src/app/globals.css"),
  "utf-8"
);

const REQUIRED_TOKENS = [
  "--glass-base",
  "--glass-elevated",
  "--glass-overlay",
  "--glass-sunken",
  "--blur-base",
  "--blur-elevated",
  "--blur-heavy",
  "--border-glass",
  "--border-glass-strong",
  "--shadow-float",
  "--shadow-card",
  "--color-accent",
  "--color-text-primary",
  "--color-text-tertiary",
  "--space-1",
  "--space-8",
  "--text-display",
  "--text-caption",
  "--tint-error",
  "--tint-success",
  "--tint-warning",
];

describe("Design token system", () => {
  REQUIRED_TOKENS.forEach((token) => {
    it(`defines ${token}`, () => {
      expect(css).toContain(token);
    });
  });
});
