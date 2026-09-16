# Eventio

A static, dependency-free HTML/CSS/JS editor for building click-through image prototypes: import an image per page, place buttons on top of it, and attach events to pages/buttons to describe interactions.

No build step, no bundler, no npm packages — just plain ES modules loaded directly by the browser (`index.html` loads `main.js` with `type="module"`).

## Project structure

`main.js` is a slim entry point that wires up DOM event listeners and bootstraps the app. All the actual logic lives in feature-based modules under [js/](js):

| File | Lines | Responsibility |
|---|---|---|
| [main.js](main.js) | 95 | Slim entry point — wires up all event listeners, bootstraps state, calls `render()` |
| [js/state.js](js/state.js) | 62 | Shared mutable state object + selectors (`currentProject`, `currentPage`, `selectedElement`, etc.) |
| [js/dom.js](js/dom.js) | 28 | Cached DOM element references |
| [js/storage.js](js/storage.js) | 85 | localStorage/IndexedDB persistence, project bootstrap, image migration |
| [js/icon-utils.js](js/icon-utils.js) | 14 | Icon rendering helpers |
| [js/tree.js](js/tree.js) | 481 | Explorer tree: rendering, context menu, copy/cut/paste, drag & drop, delete |
| [js/canvas.js](js/canvas.js) | 158 | Main image canvas, button placement/drag, hide-toggle, image upload |
| [js/editor.js](js/editor.js) | 233 | Right-hand editor panel, inline rename |
| [js/projects.js](js/projects.js) | 117 | Project modal CRUD (create/rename/delete/switch) |
| [js/zip.js](js/zip.js) | 253 | Dependency-free ZIP writer/reader, share/import |
| [js/resize.js](js/resize.js) | 26 | Panel splitter resize logic |
| [js/render.js](js/render.js) | 11 | Top-level render orchestrator |
| [icons.js](icons.js) | — | SVG icon library keyed by name |
| [styles.css](styles.css) | — | All application styles |
| [index.html](index.html) | — | App shell/markup |

### Shared state pattern

Many pieces of state (`pages`, `selectedPageId`, `selectedButtonId`, `selectedEventId`, `currentProjectId`, tree drag/clipboard state, etc.) are read and mutated from several different modules. Since ES module bindings imported via `import { x } from "./y.js"` are live but **read-only** — a module can't reassign a `let` it doesn't declare — all shared state lives on a single mutable object exported from `js/state.js`:

```js
import { state } from "./state.js";
state.selectedPageId = page.data.id; // OK: mutating a property, not reassigning the import
```

Any new cross-module state should follow this same pattern rather than introducing new top-level `let` exports.

### Data model

- `projects`: array persisted in `localStorage` under `eventio-projects`. Each project is `{ id, name, pages: [...] }`.
- Each page is `{ name, data: { id, buttons: [], events: [], imageId } }`.
- Buttons: `{ id, label, x, y, events: [] }`. Events: `{ id, name, content }`.
- Images are stored in IndexedDB (`eventio-images` database, `images` object store) keyed by `imageId`, and referenced from a page via `page.data.imageId`. Keeping images out of `localStorage` avoids its ~5MB quota.

### Import/export

Sharing a project bundles `project.json` (the full project payload) plus each referenced image as `images/<imageId>.<ext>` into a dependency-free ZIP (written by [js/zip.js](js/zip.js) using the uncompressed "store" method — no external libraries). Importing re-keys images under fresh ids and rewrites each page's `imageId` so links stay correct, and disambiguates project names with a `(1)`, `(2)`, ... suffix on collision.

## Development

There is no build step and no test runner. To work on the app:

1. Open `index.html` directly in a browser, or serve the folder with any static file server (e.g. `python3 -m http.server`).
2. Validate JS syntax with `node --check main.js js/*.js`.
3. There's no automated test suite — verify changes manually in the browser.

See `todos.md` for the running list of planned/completed features.

## What's new in Version 3

- Show the count of children on each node of the first column (explorer tree).
- Added copy/cut/paste/delete options to the context menu of the nodes in the first column.
- Buttons can now be moved outside of the image without being cropped.
- Added a hide/show toggle for the image buttons in the second column: clicking it toggles the hidden state persistently, holding it hides the buttons only while pressed. Rendered as an eye/eye-slash icon on the right side of the second column.
- Adding a new button or event in the third column now keeps focus on the current node instead of jumping to the new child; the children list still updates live.
- Child nodes can now be renamed inline from the third column.
- Sharing a project now creates a zip that includes the images, exported in a way that the links between pages and images can be rebuilt on import.
- Added an import project button in the projects modal, supporting both plain JSON/text exports and zip files with images — imported images are re-linked to their corresponding page.
- Split the single `main.js` file into smaller, human-readable feature modules under `/js` (see the Project structure table above).
