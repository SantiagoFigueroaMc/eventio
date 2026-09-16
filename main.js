import { icons } from "./icons.js";

const layout = document.querySelector(".layout");
const panels = [...document.querySelectorAll(".panel")];
const splitters = [...document.querySelectorAll(".splitter")];
const minimumPanelWidth = 120;
const pageList = document.querySelector(".page-list");
const explorerPanel = document.querySelector(".explorer");
const mainPanel = document.querySelector(".main");
const emptyState = document.querySelector(".empty-state");
const canvas = document.querySelector(".canvas");
const pageImage = document.querySelector(".page-image");
const imageButtons = document.querySelector(".image-buttons");
const toggleImageButtons = document.querySelector(".toggle-image-buttons");
const toggleImageButtonsIcon = document.querySelector(".toggle-image-buttons-icon");
const eventHeading = document.querySelector(".event-heading");
const noSelection = document.querySelector(".no-selection");
const editorForm = document.querySelector(".editor-form");
const projectPicker = document.querySelector(".project-picker");
const projectPickerLabel = document.querySelector(".project-picker-label");
const elementCounter = document.querySelector(".element-counter");
const projectModal = document.querySelector(".project-modal");
const projectList = document.querySelector(".project-list");
const importProjectButton = document.querySelector(".import-project");
const importProjectInput = document.querySelector(".import-project-input");
const projects = JSON.parse(localStorage.getItem("eventio-projects") || "[]");
const legacyPages = JSON.parse(localStorage.getItem("eventio-pages") || "[]");
const imageDatabase = openImageDatabase();
let displayedImageUrl;
let imageButtonsHidden = false;
let temporaryImageButtonsHidden = false;
let imageButtonsHideTimer;
let suppressImageButtonsClick = false;
let treeDrag;
let treeClipboard;
let treeContextMenu;
let treeRootContextMenuAttached = false;
if (!projects.length) {
    projects.push({ id: crypto.randomUUID(), name: "Untitled project", pages: legacyPages });
    localStorage.setItem("eventio-projects", JSON.stringify(projects));
}
let currentProjectId = localStorage.getItem("eventio-current-project") || projects[0].id;
if (!projects.some((project) => project.id === currentProjectId)) currentProjectId = projects[0].id;
let pages = projects.find((project) => project.id === currentProjectId).pages;
let selectedPageId;
let selectedButtonId;
let selectedEventId;
const expandedPages = new Set(pages.map((page) => page.data.id));
const expandedButtons = new Set();

function savePages() {
    localStorage.setItem("eventio-pages", JSON.stringify(pages));
    const project = currentProject();
    project.pages = pages;
    localStorage.setItem("eventio-projects", JSON.stringify(projects));
    localStorage.setItem("eventio-current-project", currentProjectId);
}

function currentProject() {
    return projects.find((project) => project.id === currentProjectId);
}

function currentPage() {
    return pages.find((page) => page.data.id === selectedPageId);
}

function openImageDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("eventio-images", 1);
        request.addEventListener("upgradeneeded", () => {
            request.result.createObjectStore("images");
        });
        request.addEventListener("success", () => resolve(request.result));
        request.addEventListener("error", () => reject(request.error));
    });
}

async function storeImage(imageId, blob) {
    const database = await imageDatabase;
    return new Promise((resolve, reject) => {
        const transaction = database.transaction("images", "readwrite");
        transaction.objectStore("images").put(blob, imageId);
        transaction.addEventListener("complete", resolve);
        transaction.addEventListener("error", () => reject(transaction.error));
    });
}

async function loadImage(imageId) {
    const database = await imageDatabase;
    return new Promise((resolve, reject) => {
        const transaction = database.transaction("images", "readonly");
        const request = transaction.objectStore("images").get(imageId);
        request.addEventListener("success", () => resolve(request.result));
        request.addEventListener("error", () => reject(request.error));
    });
}

async function migrateImages() {
    const imageMigrations = [];
    projects.forEach((project) => {
        project.pages.forEach((page) => {
            page.data.events ||= [];
            page.data.buttons ||= [];
            page.data.buttons.forEach((button) => { button.events ||= []; });
            if (!page.data.image || page.data.imageId) return;
            const imageId = `image-${page.data.id}`;
            imageMigrations.push(
                fetch(page.data.image)
                    .then((response) => response.blob())
                    .then((blob) => storeImage(imageId, blob))
                    .then(() => {
                        page.data.imageId = imageId;
                        delete page.data.image;
                    }),
            );
        });
    });
    await Promise.all(imageMigrations);
    localStorage.removeItem("eventio-pages");
    localStorage.setItem("eventio-projects", JSON.stringify(projects));
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

function getTreeNodeCount(node) {
    if (node.type === "page") return node.page.data.buttons.length + node.page.data.events.length;
    if (node.type === "button") return node.button.events.length;
    return 0;
}

function makeTreeItem(iconName, name, className, onClick, dragNode, childCount = 0) {
    if (!treeRootContextMenuAttached) {
        explorerPanel.addEventListener("contextmenu", (event) => {
            if (event.target.closest(".tree-item, .tree-toggle, .node-delete, .add-page, summary")) return;
            event.preventDefault();
            openTreeContextMenu(event, { type: "pages" });
        });
        treeRootContextMenuAttached = true;
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

    function treeNodeName(node) {
        return node.type === "page" ? node.page.name : node.type === "button" ? node.button.label : node.event.name;
    }

    function removeTreeNode(node) {
        if (node.type === "page") {
            const index = pages.indexOf(node.page);
            if (index !== -1) pages.splice(index, 1);
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
            return { list: pages, index: pages.length };
        }
        if (value.data && target.type === "page") {
            return { list: pages, index: pages.indexOf(target.page) + 1 };
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
        if (!treeClipboard) return;
        const value = treeClipboard.mode === "copy"
            ? cloneTreeValue(treeClipboard.value)
            : treeClipboard.value;
        const destination = pasteDestination(target, value);
        if (!destination) return;
        if (treeClipboard.mode === "cut") removeTreeNode(treeClipboard.node);
        destination.list.splice(destination.index, 0, value);
        if (value.data) {
            selectedPageId = value.data.id;
            selectedButtonId = undefined;
            selectedEventId = undefined;
        } else if (value.label) {
            value.events ||= [];
            selectedPageId = destination.page.data.id;
            selectedButtonId = value.id;
            selectedEventId = undefined;
        } else {
            selectedPageId = destination.page.data.id;
            selectedButtonId = destination.button?.id;
            selectedEventId = value.id;
        }
        treeClipboard = undefined;
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

    function closeTreeContextMenu() {
        treeContextMenu?.remove();
        treeContextMenu = undefined;
    }

    function openTreeContextMenu(event, node) {
        closeTreeContextMenu();
        const menu = document.createElement("div");
        menu.className = "tree-context-menu";
        menu.setAttribute("role", "menu");
        const clipboardValue = treeClipboard?.value;
        const pasteAllowed = Boolean(clipboardValue && pasteDestination(node, clipboardValue));
        const isRoot = node.type === "pages";
        menu.append(
            createTreeMenuAction("Copy", () => {
                treeClipboard = { mode: "copy", value: nodeValue(node), node };
            }, isRoot),
            createTreeMenuAction("Cut", () => {
                treeClipboard = { mode: "cut", value: nodeValue(node), node };
            }, isRoot),
            createTreeMenuAction("Paste", () => pasteTreeNode(node), !pasteAllowed),
            createTreeMenuAction("Delete", () => deleteNode(node), isRoot),
        );
        document.body.append(menu);
        const menuWidth = 150;
        const menuHeight = 164;
        menu.style.left = `${Math.min(event.clientX, window.innerWidth - menuWidth - 8)}px`;
        menu.style.top = `${Math.min(event.clientY, window.innerHeight - menuHeight - 8)}px`;
        treeContextMenu = menu;
    }
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
    pages.forEach((page) => {
        const pageItem = document.createElement("div");
        pageItem.className = `tree-node${page.data.id === selectedPageId && !selectedButtonId ? " is-active" : ""}`;
        const pageButton = makeTreeItem("page", page.name, "tree-item page-item", () => {
            selectedPageId = page.data.id;
            selectedButtonId = undefined;
            selectedEventId = undefined;
            render();
        }, { type: "page", page }, getTreeNodeCount({ type: "page", page }));
        const pageRow = createTreeRow(pageButton, expandedPages.has(page.data.id), () => {
            toggleSet(expandedPages, page.data.id);
            renderPages();
        }, page.name, () => deleteNode({ type: "page", page }));
        pageItem.append(pageRow);
        const children = document.createElement("div");
        children.className = "tree-children";
        children.hidden = !expandedPages.has(page.data.id);
        const pageChildren = [
            ...page.data.buttons.map((button) => ({ kind: "button", item: button, name: button.label })),
            ...page.data.events.map((event) => ({ kind: "page-event", item: event, name: event.name })),
        ];
        pageChildren.forEach(({ kind, item }) => {
            if (kind === "page-event") {
                const eventItem = makeTreeItem("event", item.name, `tree-item event-tree-item${item.id === selectedEventId && page.data.id === selectedPageId && !selectedButtonId ? " is-active" : ""}`, () => {
                    selectedPageId = page.data.id;
                    selectedButtonId = undefined;
                    selectedEventId = item.id;
                    render();
                }, { type: "event", event: item, page });
                const eventRow = document.createElement("div");
                eventRow.className = "tree-row";
                eventRow.append(eventItem);
                eventRow.append(createDeleteButton(item.name, () => deleteNode({ type: "event", event: item, page })));
                children.append(eventRow);
                return;
            }
            const buttonItem = makeTreeItem("button", item.label, `tree-item button-item${item.id === selectedButtonId ? " is-active" : ""}`, () => {
                selectedPageId = page.data.id;
                selectedButtonId = item.id;
                selectedEventId = undefined;
                render();
            }, { type: "button", button: item, page }, getTreeNodeCount({ type: "button", button: item }));
            const buttonRow = createTreeRow(buttonItem, expandedButtons.has(item.id), () => {
                toggleSet(expandedButtons, item.id);
                renderPages();
            }, item.label, () => deleteNode({ type: "button", button: item, page }));
            children.append(buttonRow);
            const buttonEvents = document.createElement("div");
            buttonEvents.className = "tree-children button-events";
            buttonEvents.hidden = !expandedButtons.has(item.id);
            item.events.forEach((event) => {
                const eventItem = makeTreeItem("event", event.name, `tree-item event-tree-item${event.id === selectedEventId && item.id === selectedButtonId ? " is-active" : ""}`, () => {
                    selectedPageId = page.data.id;
                    selectedButtonId = item.id;
                    selectedEventId = event.id;
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

function createDeleteButton(label, onDelete) {
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

function deleteNode(node) {
    if (node.type === "page") {
        const index = pages.findIndex((page) => page.data.id === node.page.data.id);
        if (index === -1) return;
        const [removedPage] = pages.splice(index, 1);
        if (selectedPageId === removedPage.data.id) {
            selectedPageId = pages[0]?.data.id;
            selectedButtonId = undefined;
            selectedEventId = undefined;
        }
        savePages();
        render();
        return;
    }
    const ownerPage = pages.find((page) => page.data.id === node.page.data.id);
    if (!ownerPage) return;
    if (node.type === "button") {
        const index = ownerPage.data.buttons.findIndex((button) => button.id === node.button.id);
        if (index === -1) return;
        ownerPage.data.buttons.splice(index, 1);
        if (selectedButtonId === node.button.id) {
            selectedButtonId = undefined;
            selectedEventId = undefined;
        }
        savePages();
        render();
        return;
    }
    const list = node.button ? node.button.events : ownerPage.data.events;
    const index = list.findIndex((event) => event.id === node.event.id);
    if (index === -1) return;
    list.splice(index, 1);
    if (selectedEventId === node.event.id) {
        selectedEventId = undefined;
        if (node.button) {
            selectedButtonId = node.button.id;
        } else {
            selectedPageId = ownerPage.data.id;
            selectedButtonId = undefined;
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
    if (treeDrag.node.type === "button") return { type: "page", page: node.page };
    if (treeDrag.node.type === "event" && node.type === "event") {
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
    if (!target || target === treeDrag.node) return;
    const parent = dragParentNode(target);
    const parentElement = [...pageList.querySelectorAll(".tree-item")].find((item) => item.treeNode === parent);
    parentElement?.classList.add("is-drag-parent");
    const targetCanBeParent = nodeCanBeParent(target, treeDrag.node);
    if (targetCanBeParent) {
        targetElement.classList.add("is-drag-target");
        return;
    }
    if (treeDrag.node.type === "page" && target.type !== "page") return;
    if (treeDrag.node.type !== "page" && target.type !== treeDrag.node.type) return;
    const line = document.createElement("div");
    line.className = "tree-drop-line";
    const targetRect = targetElement.getBoundingClientRect();
    line.style.top = `${event.clientY < targetRect.top + targetRect.height / 2
        ? targetRect.top - pageList.getBoundingClientRect().top
        : targetRect.bottom - pageList.getBoundingClientRect().top}px`;
    pageList.append(line);
    treeDrag.drop = { type: "before-or-after", target };
}

function removeFromParent(node) {
    if (node.type === "page") {
        const index = pages.indexOf(node.page);
        pages.splice(index, 1);
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
    const { node, drop } = treeDrag;
    if (!drop) return;
    const destination = drop.parent || (node.type === "page" ? { type: "pages" } : { type: "page", page: drop.target.page });
    if (node.type === "page") {
        pages.splice(pages.indexOf(node.page), 1);
        const targetIndex = pages.indexOf(drop.target.page);
        pages.splice(drop.position === "before" ? targetIndex : targetIndex + 1, 0, node.page);
    } else {
        removeFromParent(node);
        insertNode(node, destination, drop.position === "before" ? drop.target[drop.target.type === "event" ? "event" : "button"] : undefined);
    }
    savePages();
    render();
}

function startTreeDrag(event, node, element) {
    if (event.button !== 0) return;
    event.preventDefault();
    treeDrag = { node, element, drop: undefined };
    const move = (moveEvent) => {
        if (!treeDrag) return;
        showTreeDropFeedback(moveEvent);
        const targetElement = treeNodeElement(document.elementFromPoint(moveEvent.clientX, moveEvent.clientY));
        const target = targetElement?.treeNode;
        if (!target || target === node) return;
        if (node.type === "page" && target.type !== "page") return;
        const isParent = nodeCanBeParent(target, node);
        if (!isParent && node.type !== "page" && target.type !== node.type) {
            treeDrag.drop = { parent: { type: "page", page: target.page }, target };
            return;
        }
        const targetRect = targetElement.getBoundingClientRect();
        treeDrag.drop = isParent
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
        treeDrag = undefined;
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", stop, { once: true });
    document.addEventListener("pointercancel", stop, { once: true });
}

function toggleSet(set, id) {
    if (set.has(id)) set.delete(id);
    else set.add(id);
}

async function renderMain() {
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
            // Imported project referenced an image that isn't stored locally (e.g. a
            // text-only import without its zip's image data). Fall back to empty state
            // instead of crashing on URL.createObjectURL(undefined).
            emptyState.hidden = false;
            canvas.hidden = true;
            return;
        }
        if (displayedImageUrl) URL.revokeObjectURL(displayedImageUrl);
        displayedImageUrl = URL.createObjectURL(image);
        pageImage.src = displayedImageUrl;
        pageImage.alt = page.name;
        renderPlacedButtons(page);
    }
}

function updateImageButtonsVisibility() {
    const hidden = imageButtonsHidden || temporaryImageButtonsHidden;
    imageButtons.classList.toggle("is-hidden", hidden);
    // Only swap the icon markup when it actually changes: replacing the node that
    // received pointerdown mid-gesture stops the browser from firing "click" afterward.
    const iconName = imageButtonsHidden ? "eye-slash" : "eye";
    if (toggleImageButtonsIcon.dataset.icon !== iconName) {
        toggleImageButtonsIcon.dataset.icon = iconName;
        toggleImageButtonsIcon.innerHTML = icons[iconName];
    }
    toggleImageButtons.setAttribute("aria-pressed", String(imageButtonsHidden));
    toggleImageButtons.setAttribute("aria-label", imageButtonsHidden ? "Show image buttons" : "Hide image buttons");
}

function startTemporaryImageButtonsHide(event) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    toggleImageButtons.setPointerCapture(event.pointerId);
    temporaryImageButtonsHidden = true;
    suppressImageButtonsClick = false;
    updateImageButtonsVisibility();
    imageButtonsHideTimer = window.setTimeout(() => {
        suppressImageButtonsClick = true;
    }, 300);
}

function stopTemporaryImageButtonsHide(event) {
    if (imageButtonsHideTimer) {
        window.clearTimeout(imageButtonsHideTimer);
        imageButtonsHideTimer = undefined;
    }
    temporaryImageButtonsHidden = false;
    updateImageButtonsVisibility();
    if (toggleImageButtons.hasPointerCapture(event.pointerId)) {
        toggleImageButtons.releasePointerCapture(event.pointerId);
    }
}

function togglePersistentImageButtons() {
    if (suppressImageButtonsClick) {
        suppressImageButtonsClick = false;
        return;
    }
    imageButtonsHidden = !imageButtonsHidden;
    updateImageButtonsVisibility();
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
    updateImageButtonsVisibility();
}

function createPositionField(text, value) {
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
                isActive: button.id === selectedButtonId,
                select: () => {
                    selectedPageId = value.data.id;
                    selectedButtonId = button.id;
                    selectedEventId = undefined;
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
                isActive: event.id === selectedEventId && !selectedButtonId,
                select: () => {
                    selectedPageId = value.data.id;
                    selectedButtonId = undefined;
                    selectedEventId = event.id;
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
                childList.append(createNodeListItem("event", event.name, event.id === selectedEventId, () => {
                    selectedPageId = currentPage().data.id;
                    selectedButtonId = value.id;
                    selectedEventId = event.id;
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

function render() {
    renderPages();
    renderMain();
    renderEditor();
    renderProjectStatus();
}

function countElements() {
    return pages.reduce((total, page) => total + 1 + page.data.buttons.reduce(
        (buttonTotal, button) => buttonTotal + 1 + button.events.length,
        0,
    ) + page.data.events.length, 0);
}

function renderProjectStatus() {
    projectPickerLabel.textContent = currentProject().name;
    elementCounter.textContent = `${countElements()} elements`;
}

function renderProjectList() {
    projectList.replaceChildren();
    projects.forEach((project) => {
        const row = document.createElement("div");
        row.className = `project-row${project.id === currentProjectId ? " is-active" : ""}`;
        const select = document.createElement("button");
        select.className = "project-name";
        select.type = "button";
        select.textContent = project.name;
        select.addEventListener("click", () => switchProject(project.id));
        const edit = document.createElement("button");
        edit.className = "project-icon-action";
        edit.type = "button";
        edit.setAttribute("aria-label", `Edit ${project.name}`);
        edit.append(createIcon("edit"));
        const editLabel = document.createElement("span");
        editLabel.textContent = "Edit";
        edit.append(editLabel);
        edit.addEventListener("click", () => renameProject(project, row, select));
        const share = document.createElement("button");
        share.className = "project-icon-action";
        share.type = "button";
        share.setAttribute("aria-label", `Share ${project.name}`);
        share.append(createIcon("share"));
        const shareLabel = document.createElement("span");
        shareLabel.textContent = "Share";
        share.append(shareLabel);
        share.addEventListener("click", () => shareProject(project));
        const remove = document.createElement("button");
        remove.className = "project-icon-action";
        remove.type = "button";
        remove.setAttribute("aria-label", `Delete ${project.name}`);
        remove.append(createIcon("delete"));
        const removeLabel = document.createElement("span");
        removeLabel.textContent = "Delete";
        remove.append(removeLabel);
        remove.disabled = projects.length === 1;
        remove.addEventListener("click", () => deleteProject(project));
        row.append(select, edit, share, remove);
        projectList.append(row);
    });
}

function switchProject(projectId) {
    currentProjectId = projectId;
    pages = currentProject().pages;
    selectedPageId = undefined;
    selectedButtonId = undefined;
    selectedEventId = undefined;
    localStorage.setItem("eventio-current-project", currentProjectId);
    render();
    projectModal.close();
}

function createProject() {
    const project = { id: crypto.randomUUID(), name: `Project ${projects.length + 1}`, pages: [] };
    projects.push(project);
    switchProject(project.id);
}

function renameProject(project, row, select) {
    const input = document.createElement("input");
    input.className = "project-name-input";
    input.value = project.name;
    row.replaceChild(input, select);
    input.focus();
    input.select();
    const saveName = () => {
        project.name = input.value.trim() || project.name;
        localStorage.setItem("eventio-projects", JSON.stringify(projects));
        renderProjectList();
        renderProjectStatus();
    };
    input.addEventListener("blur", saveName, { once: true });
    input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") input.blur();
        if (event.key === "Escape") {
            input.value = project.name;
            input.blur();
        }
    });
}

function deleteProject(project) {
    if (projects.length === 1 || !window.confirm(`Delete "${project.name}"?`)) return;
    const index = projects.findIndex((item) => item.id === project.id);
    projects.splice(index, 1);
    if (project.id === currentProjectId) {
        currentProjectId = projects[0].id;
        pages = currentProject().pages;
        selectedPageId = undefined;
        selectedButtonId = undefined;
        selectedEventId = undefined;
    }
    localStorage.setItem("eventio-projects", JSON.stringify(projects));
    render();
    renderProjectList();
}

const crc32Table = (() => {
    const table = new Uint32Array(256);
    for (let value = 0; value < 256; value++) {
        let crc = value;
        for (let bit = 0; bit < 8; bit++) {
            crc = crc & 1 ? (0xedb88320 ^ (crc >>> 1)) : crc >>> 1;
        }
        table[value] = crc >>> 0;
    }
    return table;
})();

function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
        crc = crc32Table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

const imageExtensionsByMimeType = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
    "image/bmp": "bmp",
};

function extensionForMimeType(mimeType) {
    return imageExtensionsByMimeType[mimeType] || "bin";
}

const mimeTypesByExtension = Object.fromEntries(
    Object.entries(imageExtensionsByMimeType).map(([mimeType, extension]) => [extension, mimeType]),
);

function mimeTypeForExtension(extension) {
    return mimeTypesByExtension[extension.toLowerCase()] || "application/octet-stream";
}

// Builds an uncompressed ("store" method) ZIP archive from scratch, without any external
// dependency, so a project (with its images) can be shared/exported offline as a single file.
function createZipBlob(files) {
    const encoder = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    let offset = 0;
    files.forEach(({ name, data }) => {
        const nameBytes = encoder.encode(name);
        const crc = crc32(data);
        const size = data.length;
        const localHeader = new DataView(new ArrayBuffer(30));
        localHeader.setUint32(0, 0x04034b50, true);
        localHeader.setUint16(4, 20, true);
        localHeader.setUint16(6, 0, true);
        localHeader.setUint16(8, 0, true);
        localHeader.setUint16(10, 0, true);
        localHeader.setUint16(12, 0x21, true);
        localHeader.setUint32(14, crc, true);
        localHeader.setUint32(18, size, true);
        localHeader.setUint32(22, size, true);
        localHeader.setUint16(26, nameBytes.length, true);
        localHeader.setUint16(28, 0, true);
        localParts.push(new Uint8Array(localHeader.buffer), nameBytes, data);

        const centralHeader = new DataView(new ArrayBuffer(46));
        centralHeader.setUint32(0, 0x02014b50, true);
        centralHeader.setUint16(4, 20, true);
        centralHeader.setUint16(6, 20, true);
        centralHeader.setUint16(8, 0, true);
        centralHeader.setUint16(10, 0, true);
        centralHeader.setUint16(12, 0, true);
        centralHeader.setUint16(14, 0x21, true);
        centralHeader.setUint32(16, crc, true);
        centralHeader.setUint32(20, size, true);
        centralHeader.setUint32(24, size, true);
        centralHeader.setUint16(28, nameBytes.length, true);
        centralHeader.setUint16(30, 0, true);
        centralHeader.setUint16(32, 0, true);
        centralHeader.setUint16(34, 0, true);
        centralHeader.setUint16(36, 0, true);
        centralHeader.setUint32(38, 0, true);
        centralHeader.setUint32(42, offset, true);
        centralParts.push(new Uint8Array(centralHeader.buffer), nameBytes);

        offset += 30 + nameBytes.length + size;
    });
    const centralOffset = offset;
    const centralSize = centralParts.reduce((total, part) => total + part.length, 0);

    const endRecord = new DataView(new ArrayBuffer(22));
    endRecord.setUint32(0, 0x06054b50, true);
    endRecord.setUint16(4, 0, true);
    endRecord.setUint16(6, 0, true);
    endRecord.setUint16(8, files.length, true);
    endRecord.setUint16(10, files.length, true);
    endRecord.setUint32(12, centralSize, true);
    endRecord.setUint32(16, centralOffset, true);
    endRecord.setUint16(20, 0, true);

    return new Blob([...localParts, ...centralParts, new Uint8Array(endRecord.buffer)], { type: "application/zip" });
}

function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

async function shareProject(project) {
    const imageIds = new Set(project.pages.map((page) => page.data.imageId).filter(Boolean));
    let zipBlob;
    let fileName;
    try {
        const encoder = new TextEncoder();
        const files = [{ name: "project.json", data: encoder.encode(JSON.stringify(project)) }];
        for (const imageId of imageIds) {
            const blob = await loadImage(imageId);
            if (!blob) continue;
            const buffer = new Uint8Array(await blob.arrayBuffer());
            files.push({ name: `images/${imageId}.${extensionForMimeType(blob.type)}`, data: buffer });
        }
        zipBlob = createZipBlob(files);
        fileName = `${project.name.replace(/[^a-z0-9-_]+/gi, "_") || "project"}.zip`;
    } catch (error) {
        console.error("Unable to export project.", error);
        window.alert("Unable to export the project.");
        return;
    }
    const zipFile = new File([zipBlob], fileName, { type: "application/zip" });
    if (navigator.canShare?.({ files: [zipFile] })) {
        try {
            await navigator.share({ files: [zipFile], title: project.name });
            return;
        } catch (error) {
            if (error.name === "AbortError") return;
            console.error("Unable to share project.", error);
        }
    }
    downloadBlob(zipBlob, fileName);
}

// Reads back a "store" method ZIP (the only method createZipBlob produces) into a flat
// list of { name, data } entries, mirroring the writer so exported projects round-trip.
function readZipEntries(buffer) {
    const bytes = new Uint8Array(buffer);
    const view = new DataView(buffer);
    let eocdIndex = -1;
    for (let i = bytes.length - 22; i >= 0; i--) {
        if (view.getUint32(i, true) === 0x06054b50) {
            eocdIndex = i;
            break;
        }
    }
    if (eocdIndex === -1) throw new Error("Not a valid zip file.");
    const totalEntries = view.getUint16(eocdIndex + 10, true);
    const decoder = new TextDecoder();
    const entries = [];
    let pos = view.getUint32(eocdIndex + 16, true);
    for (let i = 0; i < totalEntries; i++) {
        if (view.getUint32(pos, true) !== 0x02014b50) throw new Error("Corrupt zip central directory.");
        const method = view.getUint16(pos + 10, true);
        const uncompressedSize = view.getUint32(pos + 24, true);
        const nameLen = view.getUint16(pos + 28, true);
        const extraLen = view.getUint16(pos + 30, true);
        const commentLen = view.getUint16(pos + 32, true);
        const localHeaderOffset = view.getUint32(pos + 42, true);
        const name = decoder.decode(bytes.slice(pos + 46, pos + 46 + nameLen));
        if (method !== 0) throw new Error(`Unsupported compression method for "${name}".`);
        const lhNameLen = view.getUint16(localHeaderOffset + 26, true);
        const lhExtraLen = view.getUint16(localHeaderOffset + 28, true);
        const dataStart = localHeaderOffset + 30 + lhNameLen + lhExtraLen;
        entries.push({ name, data: bytes.slice(dataStart, dataStart + uncompressedSize) });
        pos += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
}

function uniqueProjectName(name) {
    const existingNames = new Set(projects.map((project) => project.name));
    if (!existingNames.has(name)) return name;
    let counter = 1;
    while (existingNames.has(`${name} (${counter})`)) counter++;
    return `${name} (${counter})`;
}

function normalizeImportedProject(project) {
    if (!project || typeof project !== "object" || !Array.isArray(project.pages)) {
        throw new Error("Invalid project file.");
    }
    project.id = crypto.randomUUID();
    project.name = uniqueProjectName(project.name || "Imported project");
    project.pages.forEach((page) => {
        page.data ||= {};
        page.data.id ||= crypto.randomUUID();
        page.data.buttons ||= [];
        page.data.events ||= [];
        page.data.buttons.forEach((button) => {
            button.id ||= crypto.randomUUID();
            button.events ||= [];
        });
        page.data.events.forEach((event) => { event.id ||= crypto.randomUUID(); });
    });
    return project;
}

async function importProjectFromJson(file) {
    const project = JSON.parse(await file.text());
    return normalizeImportedProject(project);
}

async function importProjectFromZip(file) {
    const entries = readZipEntries(await file.arrayBuffer());
    const projectEntry = entries.find((entry) => entry.name === "project.json");
    if (!projectEntry) throw new Error("Missing project.json in the zip file.");
    const project = normalizeImportedProject(JSON.parse(new TextDecoder().decode(projectEntry.data)));
    // Re-key every bundled image under a fresh id, then repoint each page's imageId
    // to that new key so page-to-image links stay correct even if ids collide with
    // images already stored locally.
    const imageIdMap = new Map();
    for (const entry of entries) {
        if (!entry.name.startsWith("images/")) continue;
        const fileName = entry.name.slice("images/".length);
        const originalImageId = fileName.replace(/\.[^./]+$/, "");
        const extension = fileName.split(".").pop();
        const newImageId = `image-${crypto.randomUUID()}`;
        imageIdMap.set(originalImageId, newImageId);
        await storeImage(newImageId, new Blob([entry.data], { type: mimeTypeForExtension(extension) }));
    }
    project.pages.forEach((page) => {
        if (page.data.imageId && imageIdMap.has(page.data.imageId)) {
            page.data.imageId = imageIdMap.get(page.data.imageId);
        }
    });
    return project;
}

async function importProjectFile(file) {
    try {
        const isZip = file.name.toLowerCase().endsWith(".zip") || file.type === "application/zip";
        const project = isZip ? await importProjectFromZip(file) : await importProjectFromJson(file);
        projects.push(project);
        switchProject(project.id);
        localStorage.setItem("eventio-projects", JSON.stringify(projects));
        renderProjectList();
    } catch (error) {
        console.error("Unable to import project.", error);
        window.alert("Unable to import the project. Make sure the file is a valid Eventio export.");
    }
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

document.querySelector(".add-page").addEventListener("click", createPage);
projectPicker.addEventListener("click", () => {
    renderProjectList();
    projectModal.showModal();
});
document.querySelector(".close-project-modal").addEventListener("click", () => projectModal.close());
document.querySelector(".create-project").addEventListener("click", createProject);
importProjectButton.addEventListener("click", () => importProjectInput.click());
importProjectInput.addEventListener("change", (event) => {
    const file = event.target.files[0];
    importProjectInput.value = "";
    if (file) importProjectFile(file);
});
document.querySelectorAll("[data-icon]").forEach((element) => {
    element.innerHTML = icons[element.dataset.icon];
});
toggleImageButtonsIcon.dataset.icon = "eye";
toggleImageButtonsIcon.innerHTML = icons.eye;
toggleImageButtons.addEventListener("pointerdown", startTemporaryImageButtonsHide);
toggleImageButtons.addEventListener("pointerup", stopTemporaryImageButtonsHide);
toggleImageButtons.addEventListener("pointercancel", (event) => {
    stopTemporaryImageButtonsHide(event);
    suppressImageButtonsClick = false;
});
toggleImageButtons.addEventListener("click", togglePersistentImageButtons);
document.querySelector(".image-input").addEventListener("change", (event) => readImage(event.target.files[0]));
document.addEventListener("pointerdown", (event) => {
    if (treeContextMenu && !treeContextMenu.contains(event.target)) {
        treeContextMenu.remove();
        treeContextMenu = undefined;
    }
});
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && treeContextMenu) {
        treeContextMenu.remove();
        treeContextMenu = undefined;
    }
});
mainPanel.addEventListener("dragover", (event) => {
    event.preventDefault();
    if (!currentPage()?.data.imageId) mainPanel.classList.add("is-dragging");
});
mainPanel.addEventListener("dragleave", () => mainPanel.classList.remove("is-dragging"));
mainPanel.addEventListener("drop", (event) => {
    event.preventDefault();
    mainPanel.classList.remove("is-dragging");
    readImage(event.dataTransfer.files[0]);
});

async function initialize() {
    try {
        await migrateImages();
        render();
    } catch (error) {
        console.error("Unable to initialize image storage.", error);
        window.alert("Unable to initialize image storage.");
    }
}

initialize();

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
