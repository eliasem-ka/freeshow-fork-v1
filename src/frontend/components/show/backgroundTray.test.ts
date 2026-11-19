import { describe, expect, it } from "vitest"
import { changesLiveSlide, getSlideNumbers, getTrayList } from "./backgroundTray"

const VIDEO = ["mp4", "mov"]

describe("tray list", () => {
    it("puts the show's own backgrounds first, then the favourites, each file once", () => {
        const showMedia = { a: { path: "/media/loop.mp4", type: "video" }, b: { path: "/media/photo.jpg" } }
        const media = { "/media/loop.mp4": { favourite: true }, "/media/sky.png": { favourite: true }, "/media/other.png": {} }
        expect(getTrayList(showMedia, media, VIDEO)).toEqual([
            { path: "/media/loop.mp4", name: "loop.mp4", video: true, used: true },
            { path: "/media/photo.jpg", name: "photo.jpg", video: false, used: true },
            { path: "/media/sky.png", name: "sky.png", video: false, used: false }
        ])
    })

    it("leaves out audio, web addresses and entries without a file", () => {
        const showMedia = { a: { path: "/media/song.mp3", type: "audio" }, b: { path: "https://example.com/a.jpg", type: "image" }, c: {} }
        const media = { "/media/track.mp3": { favourite: true, audio: true }, "data:image/png;base64,AAA": { favourite: true } }
        expect(getTrayList(showMedia, media, VIDEO)).toEqual([])
    })

    it("reads Windows paths and upper case extensions", () => {
        expect(getTrayList(undefined, { "C:\\Media\\Loop.MP4": { favourite: true } }, VIDEO)).toEqual([{ path: "C:\\Media\\Loop.MP4", name: "Loop.MP4", video: true, used: false }])
    })
})

describe("selected slides", () => {
    it("means the whole show when nothing is selected", () => {
        expect(getSlideNumbers(null)).toBeUndefined()
        expect(getSlideNumbers([])).toBeUndefined()
    })

    it("gives the 1-based slide numbers the API takes", () => {
        expect(getSlideNumbers([{ index: 0 }, { index: 2 }, {}])).toEqual([1, 3])
    })
})

describe("the slide on screen", () => {
    it("changes with the whole show", () => {
        expect(changesLiveSlide(null, 0)).toBe(true)
        expect(changesLiveSlide([], 4)).toBe(true)
    })

    it("changes only when it is one of the selected slides", () => {
        expect(changesLiveSlide([{ index: 1 }, { index: 2 }], 0)).toBe(false)
        expect(changesLiveSlide([{ index: 0 }, { index: 1 }], 0)).toBe(true)
        expect(changesLiveSlide([{ index: 1 }], undefined)).toBe(false)
    })
})
