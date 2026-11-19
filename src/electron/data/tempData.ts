// FORK-ONLY MODULE — not part of upstream FreeShow.
//
// Temporary data mode: run the app on a throwaway copy of its data, so trying things out (tests,
// an agent creating shows, a new feature) never reaches the real library. Closing the app saves
// as usual, but into the throwaway folder.
//
//   FS_TEMP_DATA=1     start empty
//   FS_TEMP_DATA=copy  start from a copy of the real settings, projects, themes and shows
//                      (media files are not copied: they are only read, from where they are)
//
// npm run start:temp / npm run start:temp:copy do this in development.

import { app } from "electron"
import fs from "fs"
import os from "os"
import path from "path"

function setup() {
    const mode = (process.env.FS_TEMP_DATA || "").toLowerCase()
    if (!mode || mode === "0" || mode === "false") return null

    const root = fs.mkdtempSync(path.join(os.tmpdir(), "freeshow-temp-"))
    const storePath = path.join(root, "app")
    const dataPath = path.join(root, "data")
    fs.mkdirSync(storePath, { recursive: true })
    fs.mkdirSync(dataPath, { recursive: true })

    let copied = false
    if (mode === "copy") {
        try {
            // the real app files (config.json says where the data folder is)
            const realStorePath = app.getPath("userData")
            const realConfig = JSON.parse(fs.readFileSync(path.join(realStorePath, "config.json"), "utf8"))
            for (const file of fs.readdirSync(realStorePath)) {
                // the stores are the .json files at the top; the rest is the browser's own data
                if (file.endsWith(".json") && file !== "config.json") fs.copyFileSync(path.join(realStorePath, file), path.join(storePath, file))
            }
            const realDataPath: string = realConfig.dataPath || ""
            // projects, themes and the other portable stores live in the data folder's Config;
            // with a custom store path the app reads every store from that one place, so they go there
            const realConfigFolder = path.join(realDataPath, "Config")
            if (realDataPath && fs.existsSync(realConfigFolder)) {
                for (const file of fs.readdirSync(realConfigFolder)) {
                    if (file.endsWith(".json")) fs.copyFileSync(path.join(realConfigFolder, file), path.join(storePath, file))
                }
            }
            const realShows = path.join(realDataPath, "Shows")
            if (realDataPath && fs.existsSync(realShows)) fs.cpSync(realShows, path.join(dataPath, "Shows"), { recursive: true })
            copied = true
        } catch (err) {
            console.error("Temporary data: could not copy the real data, starting empty.", err)
        }
    }

    console.info(`TEMPORARY DATA MODE (${copied ? "copy of the real data" : "empty"}): ${root}`)
    return { root, storePath, dataPath, copied }
}

/** Set when the app runs on throwaway data; null in normal use. */
export const tempData = setup()

/** Shown in the main window in temporary data mode: an orange line on top and a "TEMP" tag beside the logo. */
export const TEMP_DATA_MARK = `
body::before { content: ""; position: fixed; top: 0; left: 0; right: 0; height: 3px; background: #f2994a; z-index: 99999; pointer-events: none; }
body::after { content: "TEMP"; position: fixed; top: 9px; left: 226px; padding: 2px 8px; border-radius: 4px; background: #f2994a; color: #1b1b1b; font: bold 11px/1.4 sans-serif; letter-spacing: 1px; z-index: 99999; pointer-events: none; }
`
