// Fork: writes src/frontend/components/actions/custom/apiSchemaData.ts from the types of api.ts,
// so get_api_schema (and the MCP server built on it) always describes the API as it is.
// Run after adding or changing an API action:  node scripts/generateApiSchema.js
// (a unit test fails when the file is out of date with the action list)

const { writeFileSync, readFileSync } = require("fs")
const { join } = require("path")
const ts = require("typescript")

const root = join(__dirname, "..")
const apiFile = join(root, "src", "frontend", "components", "actions", "api.ts")
const outFile = join(root, "src", "frontend", "components", "actions", "custom", "apiSchemaData.ts")

const program = ts.createProgram([apiFile], { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.NodeJs, strictNullChecks: true, skipLibCheck: true, noEmit: true, allowJs: false, esModuleInterop: true })
const checker = program.getTypeChecker()
const source = program.getSourceFile(apiFile)
const text = source.getFullText()

const MAX_DEPTH = 3

function describe(type, depth, seen) {
    if (type.flags & ts.TypeFlags.Any || type.flags & ts.TypeFlags.Unknown) return { type: "any" }
    if (type.flags & ts.TypeFlags.StringLiteral) return { type: "string", enum: [type.value] }
    if (type.flags & ts.TypeFlags.NumberLiteral) return { type: "number", enum: [type.value] }
    if (type.flags & ts.TypeFlags.BooleanLiteral) return { type: "boolean" }
    if (type.flags & ts.TypeFlags.String) return { type: "string" }
    if (type.flags & ts.TypeFlags.Number) return { type: "number" }
    if (type.flags & ts.TypeFlags.Boolean) return { type: "boolean" }
    if (type.flags & ts.TypeFlags.Null) return { type: "null" }
    if (type.flags & ts.TypeFlags.Undefined || type.flags & ts.TypeFlags.Void) return null

    if (type.isUnion()) {
        const parts = type.types.map((part) => describe(part, depth, seen)).filter(Boolean)
        // "a" | "b" -> one string with the allowed values; true | false -> boolean
        const merged = []
        parts.forEach((part) => {
            const same = merged.find((entry) => entry.type === part.type && !entry.properties && !entry.items && !part.properties && !part.items)
            if (!same) return merged.push({ ...part })
            if (same.enum && part.enum) same.enum = [...new Set([...same.enum, ...part.enum])]
            else delete same.enum
        })
        const real = merged.filter((part) => part.type !== "null")
        if (real.length === 1) return real[0]
        if (!real.length) return { type: "null" }
        return { anyOf: real }
    }

    if (checker.isArrayType(type) || checker.isTupleType(type)) {
        const element = checker.getTypeArguments(type)[0]
        return { type: "array", items: element && depth < MAX_DEPTH ? describe(element, depth + 1, seen) || { type: "any" } : { type: "any" } }
    }

    if (type.flags & ts.TypeFlags.Object || type.isIntersection()) {
        if (type.getCallSignatures().length) return { type: "any" }
        if (depth >= MAX_DEPTH || seen.includes(type)) return { type: "object" }
        const next = [...seen, type]

        const result = { type: "object" }
        const properties = checker.getPropertiesOfType(type)
        // FreeShow's own big structures (a slide item has 60 keys) are not worth spelling out
        if (depth >= 1 && properties.length > 30) return result
        if (properties.length) {
            result.properties = {}
            const required = []
            properties.forEach((property) => {
                const declaration = property.valueDeclaration || property.declarations?.[0]
                if (!declaration) return
                const described = describe(checker.getTypeOfSymbolAtLocation(property, declaration), depth + 1, next) || { type: "any" }
                const docs = ts.displayPartsToString(property.getDocumentationComment(checker)).trim()
                if (docs) described.description = docs.replace(/\s+/g, " ")
                result.properties[property.getName()] = described
                if (!(property.flags & ts.SymbolFlags.Optional)) required.push(property.getName())
            })
            if (required.length) result.required = required
        }
        const index = type.getStringIndexType()
        if (index) result.additionalProperties = describe(index, depth + 1, next) || { type: "any" }
        return result
    }

    return { type: "any" }
}

// the "// GROUP" comment lines inside API_ACTIONS name the section each action belongs to
function findActions() {
    let actions = null
    ts.forEachChild(source, (node) => {
        if (!ts.isVariableStatement(node)) return
        node.declarationList.declarations.forEach((declaration) => {
            if (declaration.name.getText(source) === "API_ACTIONS" && declaration.initializer && ts.isObjectLiteralExpression(declaration.initializer)) actions = declaration.initializer
        })
    })
    return actions
}

const actionsNode = findActions()
if (!actionsNode) throw new Error("API_ACTIONS not found in api.ts")

const schema = {}
let group = ""
actionsNode.properties.forEach((property) => {
    if (!ts.isPropertyAssignment(property)) return
    const name = property.name.getText(source)

    const comments = ts.getLeadingCommentRanges(text, property.getFullStart()) || []
    comments.forEach((range) => {
        const comment = text
            .slice(range.pos, range.end)
            .replace(/^\/\/\s*/, "")
            .trim()
        // section headers are short and upper case: "// SHOWS", "// THEMES (fork: custom/themeApi.ts)"
        const header = comment.match(/^([A-Z][A-Z /&]+)(\s*\(|$)/)
        if (header) group = header[1].trim().toLowerCase()
    })

    const trailing = (ts.getTrailingCommentRanges(text, text[property.getEnd()] === "," ? property.getEnd() + 1 : property.getEnd()) || []).map((range) => text.slice(range.pos, range.end)).join(" ")
    const entry = { group }
    // "BC" marks the actions kept only so older setups keep working
    if (/\bBC\b/.test(trailing)) entry.legacy = true

    const fn = property.initializer
    const parameter = (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) && fn.parameters[0]
    if (parameter) {
        const described = describe(checker.getTypeAtLocation(parameter), 0, [])
        if (described && described.type === "object" && described.properties) entry.params = described
    }
    schema[name] = entry
})

async function write() {
    const prettier = require("prettier")
    const header = "// GENERATED by scripts/generateApiSchema.js from the types of ../api.ts. Do not edit by hand.\n// Fork: the data behind get_api_schema (see apiSchema.ts).\n\n"
    const body = `export const API_SCHEMA_DATA: { [action: string]: { group: string; legacy?: boolean; params?: any } } = ${JSON.stringify(schema, null, 4)}\n`
    const options = await prettier.resolveConfig(outFile, { config: join(root, "config", "formatting", ".prettierrc.yaml") })
    const formatted = await prettier.format(header + body, { ...options, plugins: [], parser: "typescript" })
    let previous = ""
    try {
        previous = readFileSync(outFile, "utf8")
    } catch (err) {}
    if (previous !== formatted) writeFileSync(outFile, formatted)
    console.log(`${Object.keys(schema).length} API actions -> ${outFile}${previous === formatted ? " (unchanged)" : ""}`)
}
write()
