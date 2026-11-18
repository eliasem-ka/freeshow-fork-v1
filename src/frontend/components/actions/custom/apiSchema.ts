// FORK-ONLY MODULE — not part of upstream FreeShow.
//
// get_api_schema: the API describing itself, so an agent (or the MCP server) can discover every
// action and its parameters instead of relying on a hand-kept list. The parameter shapes come
// from apiSchemaData.ts, generated from the TypeScript types; the descriptions below are written
// by hand for the actions an agent is most likely to need.

import { API_SCHEMA_DATA } from "./apiSchemaData"

export type API_schema = {
    /** Only this action. */
    action?: string
    /** Only the actions of a section, e.g. "themes", "media", "shows". */
    group?: string
    /** Only actions whose name or description has this text. */
    search?: string
    /** Leave out the actions kept only for old setups. Default true. */
    hideLegacy?: boolean
}

export const API_DESCRIPTIONS: { [action: string]: string } = {
    // themes
    get_templates: "List every theme (template) with its folder and a simple description (spec) of its look.",
    get_template: "One theme in full: its spec, its raw items and settings, and the canvas size.",
    get_template_categories: "List the theme folders, how many themes each has, and which theme each kind of slide uses when the folder is applied as a package.",
    create_template: "Create a theme. Describe it with 'spec' (font, size, color, position, shadow, outline, box, background, decorations); raw 'items' are for full control.",
    update_template: "Change a theme. Only the keys given in 'spec' change; the rest of the theme (including shapes drawn by hand) stays.",
    delete_template: "Delete a theme (can be undone in the app).",
    duplicate_template: "Copy a theme, optionally into another folder.",
    create_template_category: "Create a theme folder, or get the id of the one with that name.",
    apply_template: "Apply a theme to the open show, another show, some slides, the slides of a group (e.g. every chorus), or every show of a project.",
    set_theme_role: "In a folder, choose which theme a kind of slide uses: 'first' (first slide), a group id such as 'verse' or 'chorus', or 'default'.",
    apply_theme_package: "Give every slide of a show (or of a whole project) the theme its group uses in a folder.",
    render_template_preview: "A PNG picture (data URL) of a theme with example text: of a saved theme, or of a spec before saving it. Use it to look at a design and correct it.",
    get_theme_palette: "The colours and fonts a folder, one theme, or all themes use, most used first.",
    replace_theme_value: "Change one colour or one font everywhere a folder or a theme uses it (text, outlines, boxes, shapes, background colour).",
    get_fonts: "Font families installed on the computer that runs FreeShow.",
    export_theme_package: "Write a theme folder (its themes, group roles and media files) to one .fstemplate file in the exports folder.",
    import_theme_file: "Import a theme package or a single .fstemplate file from a path on the computer that runs FreeShow.",
    add_factory_themes: "Add the built-in starter themes as a folder (only the ones that are missing).",
    get_output_styles: "List the output styles, the theme each one forces (if any) and the outputs that use them.",
    set_output_style_template: "Make an output style use its own theme (a different look for the stream or the stage); an empty templateId removes it.",
    set_template: "Apply a theme to the whole open show (apply_template does this and more).",
    create_lyric_template: "Create a hand-drawn band overlay and a matching theme for lyrics.",
    // media
    get_media_folders: "The folders of the media library.",
    get_media: "List videos and images of the media library (or of any folder), with optional type and name filters.",
    set_background: "Set the background image or video of a show's slides (all or some); an empty path removes it.",
    get_thumbnail: "A picture of a media file.",
    // api
    get_api_schema: "This list: every action, its section, parameters and description.",
    // shows and projects
    get_shows: "List every show (song or presentation) in the library.",
    get_show: "One show in full: slides, layouts, media.",
    get_show_layout: "The slides of a show in presentation order.",
    get_plain_text: "The text of a show as plain text with [Group] markers.",
    set_plain_text: "Replace the text of a show from plain text with [Group] markers.",
    create_show: "Create a show from plain text.",
    get_projects: "List the projects (service plans).",
    get_project: "One project and its items.",
    create_project: "Create a project.",
    add_to_project: "Add a show to a project.",
    get_groups: "The slide groups (verse, chorus...) of a show.",
    get_slide_thumbnail: "A picture of a slide as it looks on the output.",
    get_output: "What is on the output right now.",
    get_scriptures: "List the Bibles that are loaded.",
    start_scripture: "Show a Bible reference.",
    get_variables: "List the variables.",
    get_timers: "List the timers."
}

export function getApiSchema(data: API_schema = {}) {
    const search = (data?.search || "").toLowerCase()
    const group = (data?.group || "").toLowerCase()
    const hideLegacy = data?.hideLegacy !== false && !data?.action

    const actions = Object.entries(API_SCHEMA_DATA)
        .filter(([name, entry]) => {
            if (data?.action) return name === data.action
            if (hideLegacy && entry.legacy) return false
            if (group && entry.group !== group) return false
            if (search && !name.includes(search) && !(API_DESCRIPTIONS[name] || "").toLowerCase().includes(search)) return false
            return true
        })
        .map(([name, entry]) => ({ action: name, group: entry.group, description: API_DESCRIPTIONS[name] || "", ...(entry.legacy ? { legacy: true } : {}), params: entry.params || null }))

    return {
        // how to call any of them
        usage: 'POST http://localhost:5506 with JSON { "action": "<action>", ...params }. Slide and item numbers start at 1.',
        groups: [...new Set(Object.values(API_SCHEMA_DATA).map((entry) => entry.group))].filter(Boolean),
        count: actions.length,
        actions
    }
}
