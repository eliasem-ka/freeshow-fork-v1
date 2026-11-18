<script lang="ts">
    // Fork feature: tools of a theme folder, inside the Themes panel.
    //  - its colours and fonts, each one changeable in every theme of the folder at once
    //  - which theme each output style uses (a different look on the stream or the stage)
    //  - export of the whole folder to one file
    import { onMount } from "svelte"
    import { dictionary, outputs, styles, templates } from "../../stores"
    import { translateText } from "../../utils/language"
    import { exportThemePackage, getFontsAPI, replaceThemeValueAPI, setOutputStyleTemplateAPI } from "../actions/custom/themeApi"
    import { keysToID, sortByName } from "../helpers/array"
    import T from "../helpers/T.svelte"
    import { colorToHex, getPalette, keepOpacity } from "../helpers/themeSpec"
    import MaterialButton from "../inputs/MaterialButton.svelte"

    export let categoryId: string

    $: folderTemplates = sortByName(keysToID($templates)).filter((template) => template.category === categoryId)
    $: palette = getPalette(folderTemplates)

    let fonts: string[] = []
    onMount(async () => (fonts = await getFontsAPI()))

    // a colour picker fires while dragging: write once, when it closes
    function changeColor(from: string, e: Event) {
        const to = keepOpacity(from, (e.currentTarget as HTMLInputElement).value)
        if (to.toLowerCase() !== from.toLowerCase()) replaceThemeValueAPI({ categoryId, kind: "color", from, to })
    }
    function changeFont(from: string, e: Event) {
        const to = (e.currentTarget as HTMLInputElement).value.trim()
        if (to && to.toLowerCase() !== from.toLowerCase()) replaceThemeValueAPI({ categoryId, kind: "font", from, to })
    }

    $: styleList = sortByName(keysToID($styles))
    function outputNames(styleId: string) {
        return Object.values($outputs)
            .filter((output) => output.style === styleId)
            .map((output) => output.name)
            .join(", ")
    }
    function changeStyleTheme(styleId: string, e: Event) {
        setOutputStyleTemplateAPI({ styleId, templateId: (e.currentTarget as HTMLSelectElement).value })
    }
</script>

<div class="tools">
    <h4><T id="actions.theme_colors" /></h4>
    <p class="hint"><T id="actions.theme_palette_hint" /></p>
    {#if palette.colors.length}
        <div class="swatches">
            {#each palette.colors as color (color.value)}
                <label class="swatch" title="{color.value} · {color.count}">
                    <span class="chip" style="background: {color.value};" />
                    <input type="color" value={colorToHex(color.value) || "#000000"} on:change={(e) => changeColor(color.value, e)} />
                    <span class="count">{color.count}</span>
                </label>
            {/each}
        </div>
    {:else}
        <p class="empty"><T id="empty.general" /></p>
    {/if}

    {#if palette.fonts.length}
        <h4><T id="actions.theme_fonts" /></h4>
        <datalist id="themeFolderFonts">
            {#each fonts as font}<option value={font}></option>{/each}
        </datalist>
        {#each palette.fonts as font (font.value)}
            <label class="row">
                <span class="name" style="font-family: {font.value};">{font.value}</span>
                <span class="count">{font.count}</span>
                <input class="edit" type="text" list="themeFolderFonts" placeholder={translateText("actions.theme_font_replace", $dictionary)} on:change={(e) => changeFont(font.value, e)} />
            </label>
        {/each}
    {/if}

    <h4><T id="actions.theme_outputs" /></h4>
    <p class="hint"><T id="actions.theme_outputs_hint" /></p>
    {#if styleList.length}
        {#each styleList as style (style.id)}
            <label class="row">
                <span class="name"
                    >{style.name}{#if outputNames(style.id)}<small> · {outputNames(style.id)}</small>{/if}</span
                >
                <select value={style.template || ""} on:change={(e) => changeStyleTheme(style.id, e)}>
                    <option value="">{translateText("actions.theme_output_own", $dictionary)}</option>
                    {#each folderTemplates as template (template.id)}
                        <option value={template.id}>{template.name}</option>
                    {/each}
                    <!-- a theme of another folder is in use: keep it visible -->
                    {#if style.template && !folderTemplates.some((template) => template.id === style.template)}
                        <option value={style.template}>{$templates[style.template]?.name || style.template}</option>
                    {/if}
                </select>
            </label>
        {/each}
    {:else}
        <p class="empty"><T id="actions.theme_outputs_none" /></p>
    {/if}

    <div class="export">
        <MaterialButton variant="outlined" icon="export" disabled={!folderTemplates.length} title={translateText("actions.theme_export_tip", $dictionary)} on:click={() => exportThemePackage({ categoryId })} small>
            <T id="actions.theme_export" />
        </MaterialButton>
    </div>
</div>

<style>
    .tools {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 0 6px 4px;
    }
    h4 {
        margin-top: 8px;
        font-size: 0.9em;
        color: var(--secondary);
    }
    .hint,
    .empty {
        white-space: normal;
        font-size: 0.8em;
        opacity: 0.6;
    }

    .swatches {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        padding: 4px 0;
    }
    .swatch {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        cursor: pointer;
    }
    .chip {
        width: 38px;
        height: 38px;
        border-radius: 50%;
        border: 2px solid var(--primary-lighter);
        /* a checker under it, so a see-through colour looks like one */
        box-shadow: inset 0 0 0 100px transparent;
    }
    .swatch:hover .chip {
        border-color: var(--secondary);
    }
    .swatch input {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 38px;
        opacity: 0;
        cursor: pointer;
    }
    .count {
        font-size: 0.75em;
        opacity: 0.55;
    }

    .row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 3px 0;
    }
    .row .name {
        flex: 0 0 42%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .row small {
        opacity: 0.55;
    }
    .row input,
    .row select {
        flex: 1;
        min-width: 0;
        padding: 4px 6px;
        font: inherit;
        color: var(--text);
        background-color: var(--primary-darkest, var(--primary-darker));
        border: 1px solid var(--primary-lighter);
        border-radius: 4px;
        outline: none;
    }
    .row input:focus,
    .row select:focus {
        border-color: var(--secondary);
    }

    .export {
        display: flex;
        justify-content: flex-end;
        padding-top: 10px;
    }
</style>
