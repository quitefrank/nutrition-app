/**
 * Minimal framer-motion mock for jsdom (vitest) environments.
 *
 * AnimatePresence in mode="wait" defers mounting the entering child until the
 * exiting child's animation completes — but jsdom has no animation frame loop,
 * so framer-motion callbacks never fire and mode transitions are never visible.
 *
 * This mock strips all animation props and renders motion.* elements as plain
 * HTML elements, making AnimatePresence a transparent passthrough.
 */
import React from "react";

type AnyProps = Record<string, unknown>;

const MOTION_ONLY_PROPS = new Set([
  "initial", "animate", "exit", "transition", "variants",
  "whileTap", "whileHover", "whileFocus", "whileDrag",
  "layout", "layoutId", "layoutDependency",
  "onAnimationStart", "onAnimationComplete",
  "onUpdate", "onViewportEnter", "onViewportLeave",
  "drag", "dragConstraints", "dragElastic", "dragMomentum",
  "dragTransition", "dragDirectionLock",
  "viewport", "style" /* keep style passthrough below */,
]);

function createMotionComponent(tag: string) {
  const Comp = React.forwardRef<HTMLElement, AnyProps>(
    ({ children, ...props }, ref) => {
      const filtered: AnyProps = {};
      for (const [k, v] of Object.entries(props)) {
        if (!MOTION_ONLY_PROPS.has(k)) filtered[k] = v;
      }
      // style is always passed through
      if ("style" in props) filtered.style = props.style;
      return React.createElement(tag, { ...filtered, ref }, children as React.ReactNode);
    }
  );
  Comp.displayName = `motion.${tag}`;
  return Comp;
}

const HTML_TAGS = [
  "a", "article", "aside", "button", "div", "footer", "form",
  "h1", "h2", "h3", "h4", "h5", "h6", "header", "img", "input",
  "li", "main", "nav", "p", "section", "span", "svg", "ul", "path",
];

export const motion = Object.fromEntries(
  HTML_TAGS.map((tag) => [tag, createMotionComponent(tag)])
) as Record<string, ReturnType<typeof createMotionComponent>>;

export function AnimatePresence({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}

export function useReducedMotion(): boolean {
  return false;
}

export function useAnimation() {
  return { start: () => {}, stop: () => {}, set: () => {} };
}
