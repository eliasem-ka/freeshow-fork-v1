import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"
import { API_DESCRIPTIONS, getApiSchema } from "./apiSchema"
import { API_SCHEMA_DATA } from "./apiSchemaData"

// the action names as written in api.ts (importing it would pull in the whole app)
function actionsInSource() {
    const source = readFileSync(join(__dirname, "..", "api.ts"), "utf8")
    const start = source.indexOf("export const API_ACTIONS = {")
    const block = source.slice(start, source.indexOf("\n}\n", start))
    return [...block.matchAll(/^ {4}([a-z_0-9]+): /gm)].map((match) => match[1])
}

describe("api schema", () => {
    it("is up to date with api.ts (run: node scripts/generateApiSchema.js)", () => {
        expect(Object.keys(API_SCHEMA_DATA).sort()).toEqual(actionsInSource().sort())
    })

    it("only describes actions that exist", () => {
        const missing = Object.keys(API_DESCRIPTIONS).filter((action) => !API_SCHEMA_DATA[action])
        expect(missing).toEqual([])
    })

    it("describes every theme and media action of the fork", () => {
        const undescribed = Object.keys(API_SCHEMA_DATA).filter((action) => ["themes", "api"].includes(API_SCHEMA_DATA[action].group) && !API_DESCRIPTIONS[action])
        expect(undescribed).toEqual([])
    })

    it("filters by section, text and action, and hides legacy actions by default", () => {
        const themes = getApiSchema({ group: "themes" })
        expect(themes.actions.length).toBeGreaterThan(15)
        expect(themes.actions.every((action) => action.group === "themes")).toBe(true)

        expect(getApiSchema({ search: "palette" }).actions.map((action) => action.action)).toContain("get_theme_palette")

        const one = getApiSchema({ action: "apply_template" })
        expect(one.count).toBe(1)
        expect(one.actions[0].params.required).toEqual(["id"])
        expect(one.actions[0].params.properties.scope.enum).toEqual(["show", "slides", "group", "project"])

        const all = getApiSchema({ hideLegacy: false }).count
        expect(getApiSchema().count).toBeLessThan(all)
        expect(all).toBe(Object.keys(API_SCHEMA_DATA).length)
    })
})
