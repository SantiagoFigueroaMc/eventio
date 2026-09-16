import { layout, minimumPanelWidth, panels, splitters } from "./dom.js";

export function resizePanels(splitterIndex, clientX) {
    const leftPanel = panels[splitterIndex];
    const rightPanel = panels[splitterIndex + 1];
    const availableWidth = rightPanel.getBoundingClientRect().right - leftPanel.getBoundingClientRect().left - splitters[splitterIndex].offsetWidth;
    const leftWidth = Math.min(Math.max(clientX - leftPanel.getBoundingClientRect().left, minimumPanelWidth), availableWidth - minimumPanelWidth);
    leftPanel.style.flex = `0 0 ${leftWidth}px`;
    rightPanel.style.flex = `1 1 ${availableWidth - leftWidth}px`;
}

export function startResize(splitter, splitterIndex, event) {
    event.preventDefault();
    splitter.setPointerCapture(event.pointerId);
    layout.classList.add("is-resizing");
    const onPointerMove = (moveEvent) => resizePanels(splitterIndex, moveEvent.clientX);
    const stopResize = () => {
        layout.classList.remove("is-resizing");
        splitter.removeEventListener("pointermove", onPointerMove);
        splitter.removeEventListener("pointerup", stopResize);
        splitter.removeEventListener("pointercancel", stopResize);
    };
    splitter.addEventListener("pointermove", onPointerMove);
    splitter.addEventListener("pointerup", stopResize);
    splitter.addEventListener("pointercancel", stopResize);
}
