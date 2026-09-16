import { icons } from "../icons.js";
import { canvas, editorForm, emptyState, imageButtons, pageImage, toggleImageButtons, toggleImageButtonsIcon } from "./dom.js";
import { createIcon } from "./icon-utils.js";
import { currentPage, state } from "./state.js";
import { loadImage, savePages, storeImage } from "./storage.js";
import { render } from "./render.js";
import { renderEditor } from "./editor.js";

export async function renderMain() {
    const page = currentPage();
    if (!page) {
        emptyState.hidden = true;
        canvas.hidden = true;
        return;
    }
    const hasImage = Boolean(page.data.imageId);
    emptyState.hidden = hasImage;
    canvas.hidden = !hasImage;
    if (hasImage) {
        const image = await loadImage(page.data.imageId);
        if (page !== currentPage()) return;
        if (!image) {
            emptyState.hidden = false;
            canvas.hidden = true;
            return;
        }
        if (state.displayedImageUrl) URL.revokeObjectURL(state.displayedImageUrl);
        state.displayedImageUrl = URL.createObjectURL(image);
        pageImage.src = state.displayedImageUrl;
        pageImage.alt = page.name;
        renderPlacedButtons(page);
    }
}

export function updateImageButtonsVisibility() {
    const hidden = state.imageButtonsHidden || state.temporaryImageButtonsHidden;
    imageButtons.classList.toggle("is-hidden", hidden);
    const iconName = state.imageButtonsHidden ? "eye-slash" : "eye";
    if (toggleImageButtonsIcon.dataset.icon !== iconName) {
        toggleImageButtonsIcon.dataset.icon = iconName;
        toggleImageButtonsIcon.innerHTML = icons[iconName];
    }
    toggleImageButtons.setAttribute("aria-pressed", String(state.imageButtonsHidden));
    toggleImageButtons.setAttribute("aria-label", state.imageButtonsHidden ? "Show image buttons" : "Hide image buttons");
}

export function startTemporaryImageButtonsHide(event) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    toggleImageButtons.setPointerCapture(event.pointerId);
    state.temporaryImageButtonsHidden = true;
    state.suppressImageButtonsClick = false;
    updateImageButtonsVisibility();
    state.imageButtonsHideTimer = window.setTimeout(() => {
        state.suppressImageButtonsClick = true;
    }, 300);
}

export function stopTemporaryImageButtonsHide(event) {
    if (state.imageButtonsHideTimer) {
        window.clearTimeout(state.imageButtonsHideTimer);
        state.imageButtonsHideTimer = undefined;
    }
    state.temporaryImageButtonsHidden = false;
    updateImageButtonsVisibility();
    if (toggleImageButtons.hasPointerCapture(event.pointerId)) {
        toggleImageButtons.releasePointerCapture(event.pointerId);
    }
}

export function togglePersistentImageButtons() {
    if (state.suppressImageButtonsClick) {
        state.suppressImageButtonsClick = false;
        return;
    }
    state.imageButtonsHidden = !state.imageButtonsHidden;
    updateImageButtonsVisibility();
}

function renderPlacedButtons(page) {
    imageButtons.replaceChildren();
    page.data.buttons.forEach((button) => {
        const element = document.createElement("button");
        element.className = `placed-button${button.id === state.selectedButtonId ? " is-selected" : ""}`;
        element.type = "button";
        element.append(createIcon("button"), document.createTextNode(button.label));
        element.style.left = `${button.x}%`;
        element.style.top = `${button.y}%`;
        element.addEventListener("click", () => {
            state.selectedButtonId = button.id;
            state.selectedEventId = undefined;
            render();
        });
        element.addEventListener("pointerdown", (event) => startButtonDrag(event, element, button));
        imageButtons.append(element);
    });
    updateImageButtonsVisibility();
}

export function createPositionField(text, value) {
    const label = document.createElement("label");
    label.append(text);
    const input = document.createElement("input");
    input.type = "number";
    input.min = "-100";
    input.max = "200";
    input.value = value;
    label.append(input);
    return { label, input };
}

export function createPage() {
    const page = { name: `Page ${state.pages.length + 1}`, data: { id: crypto.randomUUID(), image: "", buttons: [], events: [] } };
    state.pages.push(page);
    state.selectedPageId = page.data.id;
    state.selectedEventId = undefined;
    savePages();
    render();
    editorForm.querySelector("input")?.focus();
}

export function readImage(file) {
    if (!file?.type.startsWith("image/")) return;
    const page = currentPage();
    if (!page) return;
    const imageId = `image-${page.data.id}`;
    storeImage(imageId, file).then(() => {
        if (page !== currentPage()) return;
        page.data.imageId = imageId;
        savePages();
        render();
    }).catch((error) => {
        console.error("Unable to store image.", error);
        window.alert("Unable to store the image.");
    });
}

function startButtonDrag(event, element, button) {
    event.preventDefault();
    event.stopPropagation();
    const rect = imageButtons.getBoundingClientRect();
    const move = (moveEvent) => {
        button.x = Math.max(-100, Math.min(200, ((moveEvent.clientX - rect.left) / rect.width) * 100));
        button.y = Math.max(-100, Math.min(200, ((moveEvent.clientY - rect.top) / rect.height) * 100));
        element.style.left = `${button.x}%`;
        element.style.top = `${button.y}%`;
        savePages();
    };
    const stop = () => {
        element.removeEventListener("pointermove", move);
        element.removeEventListener("pointerup", stop);
        element.removeEventListener("pointercancel", stop);
        renderEditor();
    };
    element.setPointerCapture(event.pointerId);
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", stop);
    element.addEventListener("pointercancel", stop);
}
