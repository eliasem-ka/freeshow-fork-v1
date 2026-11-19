import { describe, expect, it } from "vitest"
import { chooseMacGraphite, setGraphiteOff, shouldLearnGraphite } from "./macGraphite"

describe("Skia Graphite on macOS", () => {
    it("is turned off by default, as upstream does", () => {
        expect(chooseMacGraphite(undefined, false, "24.6.0").keep).toBe(false)
        expect(chooseMacGraphite("", false, "26.1.0").keep).toBe(false)
        expect(chooseMacGraphite(undefined, false, "").keep).toBe(false)
    })

    it("is kept from macOS 27 on, where turning it off crashes the GPU process", () => {
        expect(chooseMacGraphite(undefined, false, "27.2.0").keep).toBe(true)
        expect(chooseMacGraphite(undefined, false, "28.0.0").keep).toBe(true)
    })

    it("is kept on a machine that lost its GPU without it", () => {
        expect(chooseMacGraphite(undefined, true, "24.6.0").keep).toBe(true)
    })

    it("follows FS_MAC_GRAPHITE before anything else", () => {
        expect(chooseMacGraphite("1", false, "24.6.0").keep).toBe(true)
        expect(chooseMacGraphite("0", true, "27.2.0").keep).toBe(false)
    })
})

describe("learning from a lost GPU", () => {
    it("only applies to a Mac that started with Graphite off and did not ask for software rendering", () => {
        setGraphiteOff(true)
        expect(shouldLearnGraphite(true, false, false)).toBe(true)
        expect(shouldLearnGraphite(true, true, false)).toBe(false) // GPU works
        expect(shouldLearnGraphite(true, false, true)).toBe(false) // turned off in Settings
        expect(shouldLearnGraphite(false, false, false)).toBe(false) // not a Mac
        setGraphiteOff(false)
        expect(shouldLearnGraphite(true, false, false)).toBe(false) // Graphite was already on
    })
})
