import { icons } from "../icons.js";
import { explorerPanel, pageList } from "./dom.js";
import { createIcon } from "./icon-utils.js";
import { state } from "./state.js";
import { savePages } from "./storage.js";
import { render } from "./render.js";

export function getTreeNodeCount(node) {
    if (node.type === "page") return node.page.data.buttons.length + node.page.data.events.length;
    if (node.type === "button") return node.button.events.length;
    return 0;
}

export function makeTreeItem(iconName, name, className, onClick, dragNode, childCount = 0) {
    if (!state.treeRootContextMenuAttached) {
        explorerPanel.addEventListener("contextmenu", (event) => {
            if (event.target.closest(".tree-item, .tree-toggle, .node-delete, .add-page, summary")) return;
            event.preventDefault();
            openTreeContextMenu(event, { type: "pages" });
        });
        state.treeRootContextMenuAttached = true;
    }
    const item = document.createElement("button");
    item.className = className;
    item.type = "button";
    const icon = document.createElement("span");
    icon.className = "tree-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = icons[iconName];
    const label = document.createElement("span");
    label.className = "tree-label";
    const text = document.createElement("span");
    text.className = "tree-label-text";
    text.textContent = name;
    const count = document.createElement("span");
    count.className = "tree-count";
    count.textContent = `(${childCount})`;
    label.append(text, count);
    item.append(icon, label);
    item.addEventListener("click", onClick);
    item.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openTreeContextMenu(event, dragNode);
    });
    if (dragNode) {
        item.treeNode = dragNode;
        item.addEventListener("pointerdown", (event) => startTreeDrag(event, dragNode, item));
    }
    return item;
}

function cloneTreeValue(value) {
    const clone = structuredClone(value);
    const refreshIds = (node) => {
        node.id = crypto.randomUUID();
        node.events?.forEach(refreshIds);
        node.buttons?.forEach((button) => {
            button.id = crypto.randomUUID();
            button.events?.forEach(refreshIds);
        });
    };
    if (clone.data) {
        clone.data.id = crypto.randomUUID();
        clone.data.buttons?.forEach((button) => {
            button.id = crypto.randomUUID();
            button.events?.forEach(refreshIds);
        });
        clone.data.events?.forEach(refreshIds);
    } else {
        refreshIds(clone);
    }
    return clone;
}

function nodeValue(node) {
    return node.type === "page" ? node.page : node.type === "button" ? node.button : node.event;
}

function removeTreeNode(node) {
    if (node.type === "page") {
        const index = state.pages.indexOf(node.page);
        if (index !== -1) state.pages.splice(index, 1);
        return;
    }
    const list = node.type === "button"
        ? node.page.data.buttons
        : node.button?.events || node.page.data.events;
    const value = nodeValue(node);
    const index = list.indexOf(value);
    if (index !== -1) list.splice(index, 1);
}

function pasteDestination(target, value) {
    if (value.data && target.type === "pages") {
        return { list: state.pages, index: state.pages.length };
    }
    if (value.data && target.type === "page") {
        return { list: state.pages, index: state.pages.indexOf(target.page) + 1 };
    }
    if (value.label && target.type === "page") {
        return { list: target.page.data.buttons, index: target.page.data.buttons.length, page: target.page };
    }
    if (value.name && target.type === "page") {
        return { list: target.page.data.events, index: target.page.data.events.length, page: target.page };
    }
    if (value.name && target.type === "button") {
        return { list: target.button.events, index: target.button.events.length, page: target.page, button: target.button };
    }
    return null;
}

function pasteTreeNode(target) {
    if (!state.treeClipboard) return;
    const value = state.treeClipboard.mode === "copy"
        ? cloneTreeValue(state.treeClipboard.value)
        : state.treeClipboard.value;
    const destination = pasteDestination(target, value);
    if (!destination) return;
    if (state.treeClipboard.mode === "cut") removeTreeNode(state.treeClipboard.node);
    destination.list.splice(destination.index, 0, value);
    if (value.data) {
        state.selectedPageId = value.data.id;
        state.selectedButtonId = undefined;
        state.selectedEventId = undefined;
    } else if (value.label) {
        value.events ||= [];
        state.selectedPageId = destination.page.data.id;
        state.selectedButtonId = value.id;
        state.selectedEventId = undefined;
    } else {
        state.selectedPageId = destination.page.data.id;
        state.selectedButtonId = destination.button?.id;
        state.selectedEventId = value.id;
    }
    state.treeClipboard = undefined;
    savePages();
    render();
}

function createTreeMenuAction(label, onClick, disabled = false) {
    const action = document.createElement("button");
    action.type = "button";
    action.className = "tree-context-action";
    action.textContent = label;
    action.disabled = disabled;
    action.addEventListener("click", () => {
        onClick();
        closeTreeContextMenu();
    });
    return action;
}

export function closeTreeContextMenu() {
    state.treeContextMenu?.remove();
    state.treeContextMenu = undefined;
}

function openTreeContextMenu(event, node) {
    closeTreeContextMenu();
    const menu = document.createElement("div");
    menu.className = "tree-context-menu";
    menu.setAttribute("role", "menu");
    const clipboardValue = state.treeClipboard?.value;
    const pasteAllowed = Boolean(clipboardValue && pasteDestination(node, clipboardValue));
    const isRoot = node.type === "pages";
    menu.append(
        createTreeMenuAction("Copy", () => {
            state.treeClipboard = { mode: "copy", value: nodeValue(node), node };
        }, isRoot),
        createTreeMenuAction("Cut", () => {
            state.treeClipboard = { mode: "cut", value: nodeValue(node), node };
        }, isRoot),
        createTreeMenuAction("Paste", () => pasteTreeNode(node), !pasteAllowed),
        createTreeMenuAction("Delete", () => deleteNode(node), isRoot),
    );
    document.body.append(menu);
    const menuWidth = 150;
    const menuHeight = 164;
    menu.style.left = `${Math.min(event.clientX, window.innerWidth - menuWidth - 8)}px`;
    menu.style.top = `${Math.min(event.clientY, window.innerHeight - menuHeight - 8)}px`;
    state.treeContextMenu = menu;
}

export function renderPages() {
    pageList.replaceChildren();
    state.pages.forEach((page) => {
        const pageItem = document.createElement("div");
        pageItem.className = `tree-node${page.data.id === state.selectedPageId && !state.selectedButtonId ? " is-active" : ""}`;
        const pageButton = makeTreeItem("page", page.name, "tree-item page-item", () => {
            state.selectedPageId = page.data.id;
            state.selectedButtonId = undefined;
            state.selectedEventId = undefined;
            render();
        }, { type: "page", page }, getTreeNodeCount({ type: "page", page }));
        const pageRow = createTreeRow(pageButton, state.expandedPages.has(page.data.id), () => {
            toggleSet(state.expandedPages, page.data.id);
            renderPages();
        }, page.name, () => deleteNode({ type: "page", page }));
        pageItem.append(pageRow);
        const children = document.createElement("div");
        children.className = "tree-children";
        children.hidden = !state.expandedPages.has(page.data.id);
        const pageChildren = [
            ...page.data.buttons.map((button) => ({ kind: "button", item: button })),
            ...page.data.events.map((event) => ({ kind: "page-event", item: event })),
        ];
        pageChildren.forEach(({ kind, item }) => {
            if (kind === "page-event") {
                const eventItem = makeTreeItem("event", item.name, `tree-item event-tree-item${item.id === state.selectedEventId && page.data.id === state.selectedPageId && !state.selectedButtonId ? " is-active" : ""}`, () => {
                    state.selectedPageId = page.data.id;
                    state.selectedButtonId = undefined;
                    state.selectedEventId = item.id;
                    render();
                }, { type: "event", event: item, page });
                const eventRow = document.createElement("div");
                eventRow.className = "tree-row";
                eventRow.append(eventItem);
                eventRow.append(createDeleteButton(item.name, () => deleteNode({ type: "event", event: item, page })));
                children.append(eventRow);
                return;
            }
            const buttonItem = makeTreeItem("button", item.label, `tree-item button-item${item.id === state.selectedButtonId ? " is-active" : ""}`, () => {
                state.selectedPageId = page.data.id;
                state.selectedButtonId = item.id;
                state.selectedEventId = undefined;
                render();
            }, { type: "button", button: item, page }, getTreeNodeCount({ type: "button", button: item }));
            const buttonRow = createTreeRow(buttonItem, state.expandedButtons.has(item.id), () => {
                toggleSet(state.expandedButtons, item.id);
                renderPages();
            }, item.label, () => deleteNode({ type: "button", button: item, page }));
            children.append(buttonRow);
            const buttonEvents = document.createElement("div");
            buttonEvents.className = "tree-children button-events";
            buttonEvents.hidden = !state.expandedButtons.has(item.id);
            item.events.forEach((event) => {
                const eventItem = makeTreeItem("event", event.name, `tree-item event-tree-item${event.id === state.selectedEventId && item.id === state.selectedButtonId ? " is-active" : ""}`, () => {
                    state.selectedPageId = page.data.id;
                    state.selectedButtonId = item.id;
                    state.selectedEventId = event.id;
                    render();
                }, { type: "event", event, page, button: item });
                const eventRow = document.createElement("div");
                eventRow.className = "tree-row";
                eventRow.append(eventItem);
                eventRow.append(createDeleteButton(event.name, () => deleteNode({ type: "event", event, page, button: item })));
                buttonEvents.append(eventRow);
            });
            children.append(buttonEvents);
        });
        pageItem.append(children);
        pageList.append(pageItem);
    });
}

export function createDeleteButton(label, onDelete) {
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "node-delete";
    remove.setAttribute("aria-label", `Delete ${label}`);
    remove.title = `Delete ${label}`;
    remove.append(createIcon("delete", "node-delete-icon"));
    remove.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        onDelete();
    });
    return remove;
}

export function deleteNode(node) {
    if (node.type === "page") {
        const index = state.pages.findIndex((page) => page.data.id === node.page.data.id);
        if (index === -1) return;
        const [removedPage] = state.pages.splice(index, 1);
        if (state.selectedPageId === removedPage.data.id) {
            state.selectedPageId = state.pages[0]?.data.id;
            state.selectedButtonId = undefined;
            state.selectedEventId = undefined;
        }
        savePages();
        render();
        return;
    }
    const ownerPage = state.pages.find((page) => page.data.id === node.page.data.id);
    if (!ownerPage) return;
    if (node.type === "button") {
        const index = ownerPage.data.buttons.findIndex((button) => button.id === node.button.id);
        if (index === -1) return;
        ownerPage.data.buttons.splice(index, 1);
        if (state.selectedButtonId === node.button.id) {
            state.selectedButtonId = undefined;
            state.selectedEventId = undefined;
        }
        savePages();
        render();
        return;
    }
    const list = node.button ? node.button.events : ownerPage.data.events;
    const index = list.findIndex((event) => event.id === node.event.id);
    if (index === -1) return;
    list.splice(index, 1);
    if (state.selectedEventId === node.event.id) {
        state.selectedEventId = undefined;
        if (node.button) {
            state.selectedButtonId = node.button.id;
        } else {
            state.selectedPageId = ownerPage.data.id;
            state.selectedButtonId = undefined;
        }
    }
    savePages();
    render();
}

function createTreeRow(item, expanded, onToggle, deleteLabel, onDelete) {
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
    if (onDelete) row.append(createDeleteButton(deleteLabel, onDelete));
    return row;
}

function treeNodeElement(target) {
    return target.closest(".tree-item");
}

function nodeCanBeParent(node, dragged) {
    if (!node) return false;
    if (dragged.type === "event") return node.type === "page" || node.type === "button";
    if (dragged.type === "button") return node.type === "page";
    return false;
}

function dragParentNode(node) {
    if (state.treeDrag.node.type === "button") return { type: "page", page: node.page };
    if (state.treeDrag.node.type === "event" && node.type === "event") {
        return node.button
            ? { type: "button", button: node.button, page: node.page }
            : { type: "page", page: node.page };
    }
    return node;
}

function clearTreeDragFeedback() {
    pageList.querySelectorAll(".is-drag-target, .is-drag-parent").forEach((element) => {
        element.classList.remove("is-drag-target", "is-drag-parent");
    });
    pageList.querySelector(".tree-drop-line")?.remove();
}

function showTreeDropFeedback(event) {
    clearTreeDragFeedback();
    const targetElement = treeNodeElement(document.elementFromPoint(event.clientX, event.clientY));
    if (!targetElement) return;
    const target = targetElement.treeNode;
    if (!target || target === state.treeDrag.node) return;
    const parent = dragParentNode(target);
    const parentElement = [...pageList.querySelectorAll(".tree-item")].find((item) => item.treeNode === parent);
    parentElement?.classList.add("is-drag-parent");
    const targetCanBeParent = nodeCanBeParent(target, state.treeDrag.node);
    if (targetCanBeParent) {
        targetElement.classList.add("is-drag-target");
        return;
    }
    if (state.treeDrag.node.type === "page" && target.type !== "page") return;
    if (state.treeDrag.node.type !== "page" && target.type !== state.treeDrag.node.type) return;
    const line = document.createElement("div");
    line.className = "tree-drop-line";
    const targetRect = targetElement.getBoundingClientRect();
    line.style.top = `${event.clientY < targetRect.top + targetRect.height / 2
        ? targetRect.top - pageList.getBoundingClientRect().top
        : targetRect.bottom - pageList.getBoundingClientRect().top}px`;
    pageList.append(line);
    state.treeDrag.drop = { type: "before-or-after", target };
}

function removeFromParent(node) {
    if (node.type === "page") {
        const index = state.pages.indexOf(node.page);
        state.pages.splice(index, 1);
        return;
    }
    const list = node.type === "button"
        ? node.page.data.buttons
        : node.button?.events || node.page.data.events;
    list.splice(list.indexOf(node.type === "button" ? node.button : node.event), 1);
}

function insertNode(node, destination, beforeTarget) {
    const value = node.type === "page" ? node.page : node.type === "button" ? node.button : node.event;
    if (destination.type === "page") {
        const list = node.type === "button" ? destination.page.data.buttons : destination.page.data.events;
        const index = beforeTarget ? list.indexOf(beforeTarget) : list.length;
        list.splice(Math.max(0, index), 0, value);
        if (node.type === "button") node.page = destination.page;
        if (node.type === "event") {
            node.page = destination.page;
            node.button = undefined;
        }
        return;
    }
    destination.button.events ||= [];
    const index = beforeTarget ? destination.button.events.indexOf(beforeTarget) : destination.button.events.length;
    destination.button.events.splice(Math.max(0, index), 0, value);
    node.page = destination.page;
    node.button = destination.button;
}

function completeTreeDrop() {
    const { node, drop } = state.treeDrag;
    if (!drop) return;
    const destination = drop.parent || (node.type === "page" ? { type: "pages" } : { type: "page", page: drop.target.page });
    if (node.type === "page") {
        state.pages.splice(state.pages.indexOf(node.page), 1);
        const targetIndex = state.pages.indexOf(drop.target.page);
        state.pages.splice(drop.position === "before" ? targetIndex : targetIndex + 1, 0, node.page);
    } else {
        removeFromParent(node);
        insertNode(node, destination, drop.position === "before" ? drop.target[drop.target.type === "event" ? "event" : "button"] : undefined);
    }
    savePages();
    render();
}

export function startTreeDrag(event, node, element) {
    if (event.button !== 0) return;
    event.preventDefault();
    state.treeDrag = { node, element, drop: undefined };
    const move = (moveEvent) => {
        if (!state.treeDrag) return;
        showTreeDropFeedback(moveEvent);
        const targetElement = treeNodeElement(document.elementFromPoint(moveEvent.clientX, moveEvent.clientY));
        const target = targetElement?.treeNode;
        if (!target || target === node) return;
        if (node.type === "page" && target.type !== "page") return;
        const isParent = nodeCanBeParent(target, node);
        if (!isParent && node.type !== "page" && target.type !== node.type) {
            state.treeDrag.drop = { parent: { type: "page", page: target.page }, target };
            return;
        }
        const targetRect = targetElement.getBoundingClientRect();
        state.treeDrag.drop = isParent
            ? { parent: dragParentNode(target), target }
            : {
                target,
                position: moveEvent.clientY < targetRect.top + targetRect.height / 2 ? "before" : "after",
                parent: node.type === "page"
                    ? undefined
                    : target.type === "event" && target.button
                        ? { type: "button", button: target.button, page: target.page }
                        : { type: "page", page: target.page },
            };
    };
    const stop = () => {
        document.removeEventListener("pointermove", move);
        document.removeEventListener("pointerup", stop);
        document.removeEventListener("pointercancel", stop);
        completeTreeDrop();
        clearTreeDragFeedback();
        state.treeDrag = undefined;
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", stop, { once: true });
    document.addEventListener("pointercancel", stop, { once: true });
}

function toggleSet(set, id) {
    if (set.has(id)) set.delete(id);
    else set.add(id);
}
