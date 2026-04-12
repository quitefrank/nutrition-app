import { describe, it, expect } from "vitest"
import * as springsModule from "./springs"
import { SPRING_CARD_EXPAND, SPRING_TAB_TRANSITION, SPRING_MODAL_ENTER } from "./springs"

describe("springs", () => {
  it("has no default export", () => {
    expect((springsModule as Record<string, unknown>).default).toBeUndefined()
  })

  describe("SPRING_CARD_EXPAND", () => {
    const s = SPRING_CARD_EXPAND as { type: "spring"; stiffness: number; damping: number }

    it("has type spring", () => {
      expect(s.type).toBe("spring")
    })
    it("has stiffness 400", () => {
      expect(s.stiffness).toBe(400)
    })
    it("has damping 22", () => {
      expect(s.damping).toBe(22)
    })
  })

  describe("SPRING_TAB_TRANSITION", () => {
    const s = SPRING_TAB_TRANSITION as { type: "tween"; duration: number; ease: number[] }

    it("has type tween (not spring)", () => {
      expect(s.type).toBe("tween")
    })
    it("has duration 0.25", () => {
      expect(s.duration).toBe(0.25)
    })
    it("has ease [0.16, 1, 0.3, 1]", () => {
      expect(s.ease).toEqual([0.16, 1, 0.3, 1])
    })
  })

  describe("SPRING_MODAL_ENTER", () => {
    const s = SPRING_MODAL_ENTER as { type: "spring"; stiffness: number; damping: number }

    it("has type spring", () => {
      expect(s.type).toBe("spring")
    })
    it("has stiffness 380", () => {
      expect(s.stiffness).toBe(380)
    })
    it("has damping 24", () => {
      expect(s.damping).toBe(24)
    })
  })
})
