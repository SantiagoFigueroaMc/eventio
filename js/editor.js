import { editorForm, eventHeading, noSelection } from "./dom.js";
import { createPositionField, renderMain } from "./canvas.js";
import { createIcon, setEditorHeading } from "./icon-utils.js";
import { currentPage, selectedElement, state } from "./state.js";
import { savePages } from "./storage.js";
import { createDeleteButton, deleteNode, renderPages } from "./tree.js";
import { render } from "./render.js";

function createNodeListItem(iconName, label, isSelected, onSelect, onDelete, onRename) {
    const row = document.createElement("div");
    row.className = `node-child-row${isSelected ? " is-active" : ""}`;
    const item = document.createElement("button");
    item.type = "button";
    item.className = "node-child-item";
    item.append(createIcon(iconName, "node-child-icon"), document.createTextNode(label));
    item.addEventListener("click", onSelect);
    row.append(item);
    if (onRename) {
        const edit = document.createElement("button");
        edit.type = "button";
        edit.className = "node-edit";
        edit.setAttribute("aria-label", `Rename ${label}`);
        edit.title = `Rename ${label}`;
        edit.append(createIcon("edit", "node-edit-icon"));
        edit.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            startNodeChildRename(row, item, label, onRename);
        });
        row.append(edit);
    }
    row.append(createDeleteButton(label, onDelete));
    return row;
}

function startNodeChildRename(row, item, currentLabel, onRename) {
    const input = document.createElement("input");
    input.className = "node-child-rename-input";
    input.value = currentLabel;
    row.replaceChild(input, item);
    input.focus();
    input.select();
    const saveRename = () => {
        onRename(input.value.trim());
    };
    input.addEventListener("blur", saveRename, { once: true });
    input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") input.blur();
        if (event.key === "Escape") {
            input.value = currentLabel;
            input.blur();
        }
    });
}

export function renderEditor() {
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
        const childList = document.createElement("div");
        childList.className = "node-children";
        const childHeading = document.createElement("h3");
        childHeading.className = "node-children-heading";
        childHeading.textContent = "Children";
        childList.append(childHeading);
        const children = [
            ...value.data.buttons.map((button) => ({
                icon: "button",
                label: button.label,
                isActive: button.id === state.selectedButtonId,
                select: () => {
                    state.selectedPageId = value.data.id;
                    state.selectedButtonId = button.id;
                    state.selectedEventId = undefined;
                    render();
                },
                remove: () => deleteNode({ type: "button", button, page: value }),
                rename: (newLabel) => {
                    button.label = newLabel || "Button";
                    savePages();
                    renderPages();
                    renderMain();
                    renderEditor();
                },
            })),
            ...value.data.events.map((event) => ({
                icon: "event",
                label: event.name,
                isActive: event.id === state.selectedEventId && !state.selectedButtonId,
                select: () => {
                    state.selectedPageId = value.data.id;
                    state.selectedButtonId = undefined;
                    state.selectedEventId = event.id;
                    render();
                },
                remove: () => deleteNode({ type: "event", event, page: value }),
                rename: (newName) => {
                    event.name = newName || "Unnamed event";
                    savePages();
                    renderPages();
                    renderEditor();
                },
            })),
        ];
        if (!children.length) {
            const empty = document.createElement("p");
            empty.className = "no-buttons";
            empty.textContent = "No children yet.";
            childList.append(empty);
        } else {
            children.forEach(({ icon, label, isActive, select, remove, rename }) => {
                childList.append(createNodeListItem(icon, label, isActive, select, remove, rename));
            });
        }
        editorForm.append(childList);
        const actions = document.createElement("div");
        actions.className = "editor-actions";
        const addButton = document.createElement("button");
        addButton.type = "button";
        addButton.append(createIcon("button"), document.createTextNode("Add button"));
        addButton.disabled = !value.data.imageId;
        addButton.addEventListener("click", () => {
            const button = { id: crypto.randomUUID(), label: `Button ${value.data.buttons.length + 1}`, x: 50, y: 50, events: [] };
            value.data.buttons.push(button);
            savePages();
            render();
        });
        actions.append(addButton);
        const addEvent = document.createElement("button");
        addEvent.type = "button";
        addEvent.append(createIcon("event"), document.createTextNode("Add page event"));
        addEvent.setAttribute("aria-label", "Add event to page");
        addEvent.addEventListener("click", () => {
            addEventTo(value.data.events);
        });
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
            value[axis] = Math.max(-100, Math.min(200, Number(input.value) || 0));
            savePages();
            renderMain();
        }));
        editorForm.append(positions);
        const childList = document.createElement("div");
        childList.className = "node-children";
        const childHeading = document.createElement("h3");
        childHeading.className = "node-children-heading";
        childHeading.textContent = "Events";
        childList.append(childHeading);
        if (!value.events.length) {
            const empty = document.createElement("p");
            empty.className = "no-buttons";
            empty.textContent = "No events yet.";
            childList.append(empty);
        } else {
            value.events.forEach((event) => {
                childList.append(createNodeListItem("event", event.name, event.id === state.selectedEventId, () => {
                    state.selectedPageId = currentPage().data.id;
                    state.selectedButtonId = value.id;
                    state.selectedEventId = event.id;
                    render();
                }, () => deleteNode({ type: "event", event, page: currentPage(), button: value }), (newName) => {
                    event.name = newName || "Unnamed event";
                    savePages();
                    renderPages();
                    renderEditor();
                }));
            });
        }
        editorForm.append(childList);
        const addEvent = document.createElement("button");
        addEvent.type = "button";
        addEvent.append(createIcon("event"), document.createTextNode("Add event"));
        addEvent.addEventListener("click", () => {
            addEventTo(value.events);
        });
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
    savePages();
    render();
}
