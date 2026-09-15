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
const pageNameInput = document.querySelector(".page-name");
const buttonList = document.querySelector(".button-list");
const noButtons = document.querySelector(".no-buttons");
const eventHeading = document.querySelector(".event-heading");
const eventList = document.querySelector(".event-list");
const noSelection = document.querySelector(".no-selection");
const addEventButton = document.querySelector(".add-event");
const pages = JSON.parse(localStorage.getItem("eventio-pages") || "[]");
let selectedPageId;
let selectedButtonId;
let selectedEventOwner;

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
    if (!page || !selectedEventOwner) return null;
    if (selectedEventOwner.type === "page") return page.data.events;
    const button = page.data.buttons.find((item) => item.id === selectedEventOwner.id);
    return button?.events || null;
}

function makeTreeItem(icon, name, className, onClick) {
    const item = document.createElement("button");
    item.className = className;
    item.type = "button";
    item.innerHTML = `<span class="tree-icon" aria-hidden="true">${icon}</span>`;
    const label = document.createElement("span");
    label.textContent = name;
    item.append(label);
    item.addEventListener("click", onClick);
    return item;
}

function renderPages() {
    pageList.replaceChildren();
    sorted(pages).forEach((page) => {
        const pageItem = document.createElement("div");
        pageItem.className = `tree-node${page.data.id === selectedPageId && !selectedButtonId ? " is-active" : ""}`;
        const pageButton = makeTreeItem("▣", page.name, "tree-item page-item", () => {
            selectedPageId = page.data.id;
            selectedButtonId = undefined;
            selectedEventOwner = { type: "page" };
            render();
        });
        pageItem.append(pageButton);
        const children = document.createElement("div");
        children.className = "tree-children";
        const pageChildren = [
            ...page.data.buttons.map((button) => ({ kind: "button", item: button, name: button.label })),
            ...page.data.events.map((event) => ({ kind: "page-event", item: event, name: event.name })),
        ].sort((a, b) => a.name.localeCompare(b.name));
        pageChildren.forEach(({ kind, item }) => {
            if (kind === "page-event") {
                children.append(makeTreeItem("⚡", item.name, "tree-item event-tree-item", () => selectEventOwner(page.data.id, { type: "page" })));
                return;
            }
            const buttonItem = makeTreeItem("◆", item.label, `tree-item button-item${item.id === selectedButtonId ? " is-active" : ""}`, () => {
                selectedPageId = page.data.id;
                selectedButtonId = item.id;
                selectedEventOwner = { type: "button", id: item.id };
                render();
            });
            children.append(buttonItem);
            const buttonEvents = document.createElement("div");
            buttonEvents.className = "tree-children button-events";
            sorted(item.events).forEach((event) => buttonEvents.append(
                makeTreeItem("⚡", event.name, "tree-item event-tree-item", () => selectEventOwner(page.data.id, { type: "button", id: item.id })),
            ));
            children.append(buttonEvents);
        });
        pageItem.append(children);
        pageList.append(pageItem);
    });
}

function selectEventOwner(pageId, owner) {
    selectedPageId = pageId;
    selectedButtonId = owner.type === "button" ? owner.id : undefined;
    selectedEventOwner = owner;
    render();
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
        element.textContent = button.label;
        element.style.left = `${button.x}%`;
        element.style.top = `${button.y}%`;
        element.addEventListener("click", () => {
            selectedButtonId = button.id;
            selectedEventOwner = { type: "button", id: button.id };
            render();
        });
        element.addEventListener("pointerdown", (event) => startButtonDrag(event, element, button));
        imageButtons.append(element);
    });
}

function renderControls() {
    const page = currentPage();
    pageNameInput.value = page?.name || "";
    pageNameInput.disabled = !page;
    document.querySelector(".add-button").disabled = !page?.data.image;
    buttonList.replaceChildren();
    const buttons = sorted(page?.data.buttons || []);
    noButtons.hidden = buttons.length > 0;
    buttons.forEach((button) => {
        const card = document.createElement("article");
        card.className = "button-card";
        const header = document.createElement("header");
        const title = document.createElement("strong");
        title.textContent = `◆ ${button.label}`;
        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.textContent = "Delete";
        header.append(title, deleteButton);
        const label = document.createElement("label");
        label.append("Label");
        const labelInput = document.createElement("input");
        labelInput.type = "text";
        labelInput.value = button.label;
        label.append(labelInput);
        const positionFields = document.createElement("div");
        positionFields.className = "position-fields";
        const xField = createPositionField("X (%)", button.x);
        const yField = createPositionField("Y (%)", button.y);
        positionFields.append(xField.label, yField.label);
        card.append(header, label, positionFields);
        deleteButton.addEventListener("click", () => {
            page.data.buttons = page.data.buttons.filter((item) => item.id !== button.id);
            if (selectedButtonId === button.id) selectedButtonId = undefined;
            savePages();
            render();
        });
        labelInput.addEventListener("input", (event) => {
            button.label = event.target.value || "Button";
            savePages();
            renderPages();
            renderMain();
        });
        [["x", xField.input], ["y", yField.input]].forEach(([axis, input]) => {
            input.addEventListener("input", (event) => {
                button[axis] = Math.max(0, Math.min(100, Number(event.target.value) || 0));
                savePages();
                renderMain();
            });
        });
        buttonList.append(card);
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

function renderEvents() {
    const events = ownerEvents();
    const hasOwner = Boolean(currentPage() && selectedEventOwner);
    eventHeading.textContent = hasOwner ? `Events: ${selectedEventOwner.type === "page" ? currentPage().name : currentPage().data.buttons.find((button) => button.id === selectedEventOwner.id)?.label}` : "Events";
    noSelection.hidden = hasOwner;
    addEventButton.disabled = !hasOwner;
    eventList.replaceChildren();
    sorted(events || []).forEach((event) => {
        const card = document.createElement("article");
        card.className = "event-card";
        const name = document.createElement("input");
        name.value = event.name;
        name.setAttribute("aria-label", "Event name");
        const json = document.createElement("textarea");
        json.value = event.content;
        json.setAttribute("aria-label", "Event JSON content");
        card.append(name, json);
        name.addEventListener("input", () => { event.name = name.value || "Unnamed event"; savePages(); renderPages(); });
        json.addEventListener("input", () => { event.content = json.value; savePages(); });
        eventList.append(card);
    });
}

function render() {
    renderPages();
    renderMain();
    renderControls();
    renderEvents();
}

function createPage() {
    const page = { name: `Page ${pages.length + 1}`, data: { id: crypto.randomUUID(), image: "", buttons: [], events: [] } };
    pages.push(page);
    selectedPageId = page.data.id;
    selectedEventOwner = { type: "page" };
    savePages();
    render();
    pageNameInput.focus();
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
        renderControls();
    };
    element.setPointerCapture(event.pointerId);
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", stop);
    element.addEventListener("pointercancel", stop);
}

document.querySelector(".add-page").addEventListener("click", createPage);
document.querySelector(".add-button").addEventListener("click", () => {
    const page = currentPage();
    if (!page) return;
    const button = { id: crypto.randomUUID(), label: `Button ${page.data.buttons.length + 1}`, x: 50, y: 50, events: [] };
    page.data.buttons.push(button);
    selectedButtonId = button.id;
    selectedEventOwner = { type: "button", id: button.id };
    savePages();
    render();
});
addEventButton.addEventListener("click", () => {
    const events = ownerEvents();
    if (!events) return;
    events.push({ id: crypto.randomUUID(), name: `Event ${events.length + 1}`, content: "{}" });
    savePages();
    render();
});
pageNameInput.addEventListener("input", (event) => {
    const page = currentPage();
    if (!page) return;
    page.name = event.target.value || "Untitled page";
    savePages();
    renderPages();
    renderEvents();
});
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
