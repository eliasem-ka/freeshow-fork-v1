<script lang="ts">
    // Fork feature: quick editor of a theme, inside the Themes panel.
    // The few things that are changed nine times out of ten (font, size, colour, place, shadow,
    // outline, box, background) with a live preview; the full editor is one button away.
    // Only what is touched here changes: the rest of the theme stays as it was drawn.
    import { createEventDispatcher, onMount } from "svelte"
    import type { Template } from "../../../types/Show"
    import { dictionary, outputs, styles, templates } from "../../stores"
    import { translateText } from "../../utils/language"
    import { getFontsAPI, updateTemplateAPI } from "../actions/custom/themeApi"
    import Card from "../drawer/Card.svelte"
    import TemplateSlide from "../drawer/pages/TemplateSlide.svelte"
    import { clone } from "../helpers/array"
    import { getResolution } from "../helpers/output"
    import T from "../helpers/T.svelte"
    import { colorToHex, fillSampleText, itemsToSpec, keepOpacity, patchItemsWithSpec, patchSettingsWithSpec, type ThemePosition, type ThemeSpec } from "../helpers/themeSpec"
    import MaterialButton from "../inputs/MaterialButton.svelte"

    export let templateId: string

    const dispatch = createEventDispatcher<{ close: void; fullEditor: void }>()

    $: template = $templates[templateId] as Template | undefined
    $: resolution = getResolution(null, { $outputs, $styles })

    // what the theme is now, and what was changed here (only these keys are written on save)
    let changes: ThemeSpec = {}
    $: original = template ? itemsToSpec(template.items, template.settings) : {}
    $: current = { ...original, ...changes } as ThemeSpec

    $: draft = template ? buildDraft(template, changes) : null
    function buildDraft(source: Template, spec: ThemeSpec): Template {
        const items = patchItemsWithSpec(source.items || [], spec)
        // an empty text box would preview as nothing: show the theme's name in it
        const hasText = items.some((item) => item.lines?.some((line) => line.text?.some((text) => text.value)))
        return { ...clone(source), items: hasText ? items : fillSampleText(items, source.name || "Aa"), settings: patchSettingsWithSpec(source.settings, spec) }
    }

    function set(values: ThemeSpec) {
        changes = { ...changes, ...values }
    }
    $: changed = Object.keys(changes).length > 0

    function save() {
        if (changed) updateTemplateAPI({ id: templateId, spec: changes })
        dispatch("close")
    }

    const ALIGNS = ["left", "center", "right"] as const
    const VERTICALS = ["top", "center", "bottom"] as const
    const POSITIONS: ThemePosition[] = ["full", "center", "upper_third", "lower_third", "top", "bottom", "left", "right"]
    $: positionName = typeof current.position === "string" ? current.position : current.position ? "custom" : "full"

    const setPosition = (e: Event) => set({ position: valueOf(e) as ThemePosition })
    const numberOf = (e: Event, fallback = 0) => {
        const value = Number((e.currentTarget as HTMLInputElement).value)
        return isNaN(value) ? fallback : value
    }
    const valueOf = (e: Event) => (e.currentTarget as HTMLInputElement | HTMLSelectElement).value
    const checked = (e: Event) => (e.currentTarget as HTMLInputElement).checked

    $: shadow = current.shadow || null
    $: outline = current.outline || null
    $: box = current.box || null
    $: isBold = current.weight === "bold" || Number(current.weight) >= 600

    let fonts: string[] = []
    onMount(async () => (fonts = await getFontsAPI()))

    function keydown(e: KeyboardEvent) {
        if (e.key !== "Escape") return
        e.stopPropagation()
        dispatch("close")
    }
</script>

<svelte:window on:keydown|capture={keydown} />

{#if template && draft}
    <div class="quick">
        <div class="preview">
            <Card width={100} label={template.name} color={template.color} {resolution}>
                <TemplateSlide {templateId} template={draft} preview />
            </Card>
        </div>

        <div class="fields">
            <label class="wide">
                <span><T id="edit.font" /></span>
                <input class="edit" type="text" list="themeQuickFonts" value={current.font || ""} placeholder="CMGSans" on:change={(e) => set({ font: valueOf(e).trim() })} />
                <datalist id="themeQuickFonts">
                    {#each fonts as font}<option value={font}></option>{/each}
                </datalist>
            </label>

            <label>
                <span><T id="actions.theme_size" /></span>
                <input class="edit" type="number" min="10" max="600" step="2" value={current.size || 100} on:change={(e) => set({ size: numberOf(e, 100) })} />
            </label>
            <label>
                <span><T id="edit.color" /></span>
                <input type="color" value={colorToHex(current.color || "#FFFFFF") || "#ffffff"} on:input={(e) => set({ color: keepOpacity(current.color || "#FFFFFF", valueOf(e)) })} />
            </label>

            <div class="toggles wide">
                <button class:on={isBold} title={translateText("edit._title_bold", $dictionary)} on:click={() => set({ weight: isBold ? "normal" : "bold" })}><b>B</b></button>
                <button class:on={current.italic} title={translateText("edit._title_italic", $dictionary)} on:click={() => set({ italic: !current.italic })}><i>I</i></button>
                <button class:on={current.uppercase} title={translateText("edit.uppercase", $dictionary)} on:click={() => set({ uppercase: !current.uppercase })}>AA</button>
                <span class="gap" />
                {#each ALIGNS as align}
                    <button class:on={(current.align || "center") === align} title={translateText("edit._title_" + align, $dictionary)} on:click={() => set({ align })}>
                        <span class="bars {align}"><i /><i /><i /></span>
                    </button>
                {/each}
                <span class="gap" />
                {#each VERTICALS as vertical}
                    <button class:on={(current.verticalAlign || "center") === vertical} title={translateText("actions.theme_vertical_" + vertical, $dictionary)} on:click={() => set({ verticalAlign: vertical })}>
                        <span class="block {vertical}"><i /></span>
                    </button>
                {/each}
            </div>

            <label>
                <span><T id="actions.theme_position" /></span>
                <select value={positionName} on:change={setPosition}>
                    {#if positionName === "custom"}<option value="custom" disabled>{translateText("actions.theme_position_custom", $dictionary)}</option>{/if}
                    {#each POSITIONS as position}
                        <option value={position}>{translateText("actions.theme_position_" + position, $dictionary)}</option>
                    {/each}
                </select>
            </label>
            <label>
                <span><T id="actions.theme_margin" /></span>
                <input class="edit" type="number" min="0" max="400" step="10" value={current.margin ?? 60} disabled={positionName === "custom"} on:change={(e) => set({ margin: numberOf(e, 60), position: current.position })} />
            </label>

            <label class="check">
                <input type="checkbox" checked={current.shadow !== false} on:change={(e) => set({ shadow: checked(e) ? { color: "#000000", x: 2, y: 2, blur: 10 } : false })} />
                <span><T id="edit.shadow" /></span>
            </label>
            <div class="pair">
                {#if current.shadow !== false}
                    <input type="color" value={colorToHex(shadow?.color || "#000000") || "#000000"} on:input={(e) => set({ shadow: { x: 2, y: 2, blur: 10, ...(shadow || {}), color: keepOpacity(shadow?.color || "#000000", valueOf(e)) } })} />
                    <input class="edit" type="number" min="0" max="100" title={translateText("edit.blur", $dictionary)} value={shadow?.blur ?? 10} on:change={(e) => set({ shadow: { color: "#000000", x: 2, y: 2, ...(shadow || {}), blur: numberOf(e, 10) } })} />
                {/if}
            </div>

            <label class="check">
                <input type="checkbox" checked={!!outline} on:change={(e) => set({ outline: checked(e) ? { color: "#000000", width: 4 } : false })} />
                <span><T id="edit.outline" /></span>
            </label>
            <div class="pair">
                {#if outline}
                    <input type="color" value={colorToHex(outline.color || "#000000") || "#000000"} on:input={(e) => set({ outline: { ...outline, color: valueOf(e) } })} />
                    <input class="edit" type="number" min="1" max="40" title={translateText("edit.width", $dictionary)} value={outline.width ?? 4} on:change={(e) => set({ outline: { ...outline, width: numberOf(e, 4) } })} />
                {/if}
            </div>

            <label class="check">
                <input type="checkbox" checked={!!box} on:change={(e) => set({ box: checked(e) ? { color: "rgb(0 0 0 / 0.6)", radius: 20, padding: 30 } : false })} />
                <span><T id="actions.theme_box" /></span>
            </label>
            <div class="pair">
                {#if box}
                    <input type="color" value={colorToHex(box.color || "#000000") || "#000000"} on:input={(e) => set({ box: { ...box, color: keepOpacity(box?.color || "#000000", valueOf(e)) } })} />
                    <input class="edit" type="number" min="0" max="200" title={translateText("edit.corner_radius", $dictionary)} value={box.radius ?? 0} on:change={(e) => set({ box: { ...box, radius: numberOf(e) } })} />
                {/if}
            </div>

            <label class="check">
                <input type="checkbox" checked={!!current.background?.color} on:change={(e) => set({ background: { ...(current.background || {}), color: checked(e) ? "#101820" : undefined } })} />
                <span><T id="edit.background_color" /></span>
            </label>
            <div class="pair">
                {#if current.background?.color}
                    <input type="color" value={colorToHex(current.background.color) || "#000000"} on:input={(e) => set({ background: { ...(current.background || {}), color: valueOf(e) } })} />
                {/if}
            </div>
        </div>

        <div class="buttons">
            <MaterialButton icon="edit" on:click={() => dispatch("fullEditor")} small>
                <T id="actions.theme_full_editor" />
            </MaterialButton>
            <span class="gap" />
            <MaterialButton on:click={() => dispatch("close")} small>
                <T id="popup.cancel" />
            </MaterialButton>
            <MaterialButton variant="outlined" icon="save" disabled={!changed} on:click={save} small>
                <T id="actions.save" />
            </MaterialButton>
        </div>
    </div>
{/if}

<style>
    .quick {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 4px 6px;
    }
    .preview {
        width: 62%;
        margin: 0 auto;
        pointer-events: none;
    }

    .fields {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px 12px;
        align-items: center;
    }
    .wide {
        grid-column: 1 / -1;
    }
    label {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
    }
    label > span {
        flex: 0 0 38%;
        font-size: 0.85em;
        opacity: 0.8;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    label.wide > span {
        flex-basis: 18%;
    }
    label.check > span {
        flex: 1;
    }
    .pair {
        display: flex;
        align-items: center;
        gap: 8px;
        min-height: 30px;
    }

    input.edit,
    select {
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
    input.edit:focus,
    select:focus {
        border-color: var(--secondary);
    }
    input:disabled {
        opacity: 0.4;
    }
    input[type="color"] {
        flex: 0 0 44px;
        width: 44px;
        height: 28px;
        padding: 0;
        background: none;
        border: 1px solid var(--primary-lighter);
        border-radius: 4px;
        cursor: pointer;
    }
    input[type="checkbox"] {
        width: 16px;
        height: 16px;
        accent-color: var(--secondary);
    }

    .toggles {
        display: flex;
        align-items: center;
        gap: 4px;
    }
    .toggles .gap,
    .buttons .gap {
        flex: 1;
    }
    .toggles button {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 30px;
        font: inherit;
        font-size: 0.9em;
        color: var(--text);
        background-color: var(--primary-darkest, var(--primary-darker));
        border: 1px solid var(--primary-lighter);
        border-radius: 4px;
        cursor: pointer;
    }
    .toggles button:hover {
        border-color: var(--secondary);
    }
    .toggles button.on {
        background-color: var(--secondary);
        border-color: var(--secondary);
        color: var(--secondary-text, #fff);
    }

    /* tiny drawings of the alignment, so no extra icons are needed */
    .bars {
        display: flex;
        flex-direction: column;
        gap: 3px;
        width: 16px;
    }
    .bars i {
        width: 100%;
        height: 2px;
        background-color: currentColor;
    }
    .bars i:nth-child(2) {
        width: 60%;
    }
    .bars.center {
        align-items: center;
    }
    .bars.right {
        align-items: flex-end;
    }
    .block {
        display: flex;
        width: 16px;
        height: 16px;
        border: 1px solid currentColor;
        border-radius: 2px;
        padding: 2px;
    }
    .block i {
        width: 100%;
        height: 4px;
        background-color: currentColor;
    }
    .block.center {
        align-items: center;
    }
    .block.bottom {
        align-items: flex-end;
    }

    .buttons {
        display: flex;
        align-items: center;
        gap: 6px;
        padding-top: 4px;
        border-top: 1px solid var(--primary-lighter);
    }
</style>
