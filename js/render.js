import { renderMain } from "./canvas.js";
import { renderEditor } from "./editor.js";
import { renderProjectStatus } from "./projects.js";
import { renderPages } from "./tree.js";

export function render() {
    renderPages();
    renderMain();
    renderEditor();
    renderProjectStatus();
}
