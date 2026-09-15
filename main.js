import { icons } from "./icons.js";

const layout = document.querySelector(".layout");
const panels = [...document.querySelectorAll(".panel")];
const splitters = [...document.querySelectorAll(".splitter")];
const minimumPanelWidth = 120;
const pageList = document.querySelector(".page-list");
const mainPanel = document.querySelector(".main");
const emptyState = document.querySelector(".empty-state");
const canvas = document.querySelector(".canvas");
const pageImage = document.querySelector(".page-image");
const imageButtons = document.querySelector(".image-buttons");
const eventHeading = document.querySelector(".event-heading");
const noSelection = document.querySelector(".no-selection");
const editorForm = document.querySelector(".editor-form");
const pages = JSON.parse(localStorage.getItem("eventio-pages") || "[]");
let selectedPageId;
let selectedButtonId;
let selectedEventId;
const expandedPages = new Set(pages.map((page) => page.data.id));
const expandedButtons = new Set();

function savePages() {
    localStorage.setItem("eventio-pages", JSON.stringify(pages));
}

function currentPage() {
    return pages.find((page) => page.data.id === selectedPageId);
}

function sorted(items) {
    return [...items].sort((a, b) => a.name.localeCompare(b.name));
}

function ownerEvents() {
    const page = currentPage();
    if (!page || !selectedButtonId) return page?.data.events || null;
    const button = page.data.buttons.find((item) => item.id === selectedButtonId);
    return button?.events || null;
}

function selectedElement() {
    const page = currentPage();
    if (!page) return null;
    if (selectedEventId) {
        const events = selectedButtonId
            ? page.data.buttons.find((button) => button.id === selectedButtonId)?.events
            : page.data.events;
        const event = events?.find((item) => item.id === selectedEventId);
        if (event) return { type: "event", value: event };
    }
    if (selectedButtonId) {
        const button = page.data.buttons.find((item) => item.id === selectedButtonId);
        if (button) return { type: "button", value: button };
    }
    return { type: "page", value: page };
}

function makeTreeItem(iconName, name, className, onClick) {
    const item = document.createElement("button");
    item.className = className;
    item.type = "button";
    const icon = document.createElement("span");
    icon.className = "tree-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = icons[iconName];
    const label = document.createElement("span");
    label.textContent = name;
    item.append(icon, label);
    item.addEventListener("click", onClick);
    return item;
}

function createIcon(iconName, className = "item-icon") {
    const icon = document.createElement("span");
    icon.className = className;
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = icons[iconName];
    return icon;
}

function setEditorHeading(iconName, label) {
    eventHeading.replaceChildren(createIcon(iconName, "editor-heading-icon"), document.createTextNode(label));
}

function renderPages() {
    pageList.replaceChildren();
    sorted(pages).forEach((page) => {
        const pageItem = document.createElement("div");
        pageItem.className = `tree-node${page.data.id === selectedPageId && !selectedButtonId ? " is-active" : ""}`;
        const pageButton = makeTreeItem("page", page.name, "tree-item page-item", () => {
            selectedPageId = page.data.id;
            selectedButtonId = undefined;
            selectedEventId = undefined;
            render();
        });
        const pageRow = createTreeRow(pageButton, expandedPages.has(page.data.id), () => {
            toggleSet(expandedPages, page.data.id);
            renderPages();
        });
        pageItem.append(pageRow);
        const children = document.createElement("div");
        children.className = "tree-children";
        children.hidden = !expandedPages.has(page.data.id);
        const pageChildren = [
            ...page.data.buttons.map((button) => ({ kind: "button", item: button, name: button.label })),
            ...page.data.events.map((event) => ({ kind: "page-event", item: event, name: event.name })),
        ].sort((a, b) => a.name.localeCompare(b.name));
        pageChildren.forEach(({ kind, item }) => {
            if (kind === "page-event") {
                children.append(makeTreeItem("event", item.name, `tree-item event-tree-item${item.id === selectedEventId && page.data.id === selectedPageId && !selectedButtonId ? " is-active" : ""}`, () => {
                    selectedPageId = page.data.id;
                    selectedButtonId = undefined;
                    selectedEventId = item.id;
                    render();
                }));
                return;
            }
            const buttonItem = makeTreeItem("button", item.label, `tree-item button-item${item.id === selectedButtonId ? " is-active" : ""}`, () => {
                selectedPageId = page.data.id;
                selectedButtonId = item.id;
                selectedEventId = undefined;
                render();
            });
            const buttonRow = createTreeRow(buttonItem, expandedButtons.has(item.id), () => {
                toggleSet(expandedButtons, item.id);
                renderPages();
            });
            children.append(buttonRow);
            const buttonEvents = document.createElement("div");
            buttonEvents.className = "tree-children button-events";
            buttonEvents.hidden = !expandedButtons.has(item.id);
            sorted(item.events).forEach((event) => buttonEvents.append(
                makeTreeItem("event", event.name, `tree-item event-tree-item${event.id === selectedEventId && item.id === selectedButtonId ? " is-active" : ""}`, () => {
                    selectedPageId = page.data.id;
                    selectedButtonId = item.id;
                    selectedEventId = event.id;
                    render();
                }),
            ));
            children.append(buttonEvents);
        });
        pageItem.append(children);
        pageList.append(pageItem);
    });
}

function createTreeRow(item, expanded, onToggle) {
    const row = document.createElement("div");
    row.className = "tree-row";
    const toggle = document.createElement("button");
    toggle.className = `tree-toggle${expanded ? " is-expanded" : ""}`;
    toggle.type = "button";
    toggle.setAttribute("aria-label", expanded ? "Collapse level" : "Expand level");
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.addEventListener("click", (event) => {
        event.stopPropagation();
        onToggle();
    });
    row.append(toggle, item);
    return row;
}

function toggleSet(set, id) {
    if (set.has(id)) set.delete(id);
    else set.add(id);
}

function renderMain() {
    const page = currentPage();
    if (!page) {
        emptyState.hidden = true;
        canvas.hidden = true;
        return;
    }
    const hasImage = Boolean(page.data.image);
    emptyState.hidden = hasImage;
    canvas.hidden = !hasImage;
    if (hasImage) {
        pageImage.src = page.data.image;
        pageImage.alt = page.name;
        renderPlacedButtons(page);
    }
}

function renderPlacedButtons(page) {
    imageButtons.replaceChildren();
    page.data.buttons.forEach((button) => {
        const element = document.createElement("button");
        element.className = `placed-button${button.id === selectedButtonId ? " is-selected" : ""}`;
        element.type = "button";
        element.append(createIcon("button"), document.createTextNode(button.label));
        element.style.left = `${button.x}%`;
        element.style.top = `${button.y}%`;
        element.addEventListener("click", () => {
            selectedButtonId = button.id;
            selectedEventId = undefined;
            render();
        });
        element.addEventListener("pointerdown", (event) => startButtonDrag(event, element, button));
        imageButtons.append(element);
    });
}

function createPositionField(text, value) {
    const label = document.createElement("label");
    label.append(text);
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.max = "100";
    input.value = value;
    label.append(input);
    return { label, input };
}

function renderEditor() {
    const selected = selectedElement();
    editorForm.replaceChildren();
    noSelection.hidden = Boolean(selected);
    if (!selected) {
        eventHeading.textContent = "Editor";
        return;
    }
    const { type, value } = selected;
    setEditorHeading(type, type[0].toUpperCase() + type.slice(1));
    if (type === "page") {
        const name = document.createElement("input");
        name.value = value.name;
        name.setAttribute("aria-label", "Page name");
        name.addEventListener("input", () => {
            value.name = name.value || "Untitled page";
            savePages();
            renderPages();
        });
        editorForm.append(createLabeledField("Name", name));
        const actions = document.createElement("div");
        actions.className = "editor-actions";
        const addButton = document.createElement("button");
        addButton.type = "button";
        addButton.append(createIcon("button"), document.createTextNode("Add button"));
        addButton.disabled = !value.data.image;
        addButton.addEventListener("click", () => {
            const button = { id: crypto.randomUUID(), label: `Button ${value.data.buttons.length + 1}`, x: 50, y: 50, events: [] };
            value.data.buttons.push(button);
            selectedButtonId = button.id;
            selectedEventId = undefined;
            savePages();
            render();
        });
        actions.append(addButton);
        const addEvent = document.createElement("button");
        addEvent.type = "button";
        addEvent.append(createIcon("event"), document.createTextNode("Add page event"));
        addEvent.setAttribute("aria-label", "Add event to page");
        addEvent.addEventListener("click", () => addEventTo(value.data.events));
        actions.append(addEvent);
        editorForm.append(actions);
        return;
    }
    if (type === "button") {
        const label = document.createElement("input");
        label.value = value.label;
        label.addEventListener("input", () => {
            value.label = label.value || "Button";
            savePages();
            renderPages();
            renderMain();
        });
        editorForm.append(createLabeledField("Label", label));
        const positions = document.createElement("div");
        positions.className = "position-fields";
        const x = createPositionField("X (%)", value.x);
        const y = createPositionField("Y (%)", value.y);
        positions.append(x.label, y.label);
        [["x", x.input], ["y", y.input]].forEach(([axis, input]) => input.addEventListener("input", () => {
            value[axis] = Math.max(0, Math.min(100, Number(input.value) || 0));
            savePages();
            renderMain();
        }));
        editorForm.append(positions);
        const addEvent = document.createElement("button");
        addEvent.type = "button";
        addEvent.append(createIcon("event"), document.createTextNode("Add event"));
        addEvent.addEventListener("click", () => addEventTo(value.events));
        editorForm.append(addEvent);
        return;
    }
    const name = document.createElement("input");
    name.value = value.name;
    const content = document.createElement("textarea");
    content.value = value.content;
    name.addEventListener("input", () => { value.name = name.value || "Unnamed event"; savePages(); renderPages(); });
    content.addEventListener("input", () => { value.content = content.value; savePages(); });
    editorForm.append(createLabeledField("Name", name), createLabeledField("JSON content", content));
}

function createLabeledField(text, control) {
    const label = document.createElement("label");
    label.append(text, control);
    return label;
}

function addEventTo(events) {
    const event = { id: crypto.randomUUID(), name: `Event ${events.length + 1}`, content: "{}" };
    events.push(event);
    selectedEventId = event.id;
    savePages();
    render();
}

function render() {
    renderPages();
    renderMain();
    renderEditor();
}

function createPage() {
    const page = { name: `Page ${pages.length + 1}`, data: { id: crypto.randomUUID(), image: "", buttons: [], events: [] } };
    pages.push(page);
    selectedPageId = page.data.id;
    selectedEventId = undefined;
    savePages();
    render();
    editorForm.querySelector("input")?.focus();
}

function readImage(file) {
    if (!file?.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.addEventListener("load", () => {
        const page = currentPage();
        if (!page) return;
        page.data.image = reader.result;
        savePages();
        render();
    });
    reader.readAsDataURL(file);
}

function startButtonDrag(event, element, button) {
    event.preventDefault();
    event.stopPropagation();
    const rect = imageButtons.getBoundingClientRect();
    const move = (moveEvent) => {
        button.x = Math.max(0, Math.min(100, ((moveEvent.clientX - rect.left) / rect.width) * 100));
        button.y = Math.max(0, Math.min(100, ((moveEvent.clientY - rect.top) / rect.height) * 100));
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

document.querySelector(".add-page").addEventListener("click", createPage);
document.querySelector(".image-input").addEventListener("change", (event) => readImage(event.target.files[0]));
mainPanel.addEventListener("dragover", (event) => {
    event.preventDefault();
    if (!currentPage()?.data.image) mainPanel.classList.add("is-dragging");
});
mainPanel.addEventListener("dragleave", () => mainPanel.classList.remove("is-dragging"));
mainPanel.addEventListener("drop", (event) => {
    event.preventDefault();
    mainPanel.classList.remove("is-dragging");
    readImage(event.dataTransfer.files[0]);
});

pages.forEach((page) => {
    page.data.events ||= [];
    page.data.buttons ||= [];
    page.data.buttons.forEach((button) => { button.events ||= []; });
});
render();

function resizePanels(splitterIndex, clientX) {
    const leftPanel = panels[splitterIndex];
    const rightPanel = panels[splitterIndex + 1];
    const availableWidth = rightPanel.getBoundingClientRect().right - leftPanel.getBoundingClientRect().left - splitters[splitterIndex].offsetWidth;
    const leftWidth = Math.min(Math.max(clientX - leftPanel.getBoundingClientRect().left, minimumPanelWidth), availableWidth - minimumPanelWidth);
    leftPanel.style.flex = `0 0 ${leftWidth}px`;
    rightPanel.style.flex = `1 1 ${availableWidth - leftWidth}px`;
}

splitters.forEach((splitter, splitterIndex) => {
    splitter.addEventListener("pointerdown", (event) => {
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
    });
});
