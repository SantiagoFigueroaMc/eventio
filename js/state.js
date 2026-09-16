export const state = {
    displayedImageUrl: undefined,
    imageButtonsHidden: false,
    temporaryImageButtonsHidden: false,
    imageButtonsHideTimer: undefined,
    suppressImageButtonsClick: false,
    treeDrag: undefined,
    treeClipboard: undefined,
    treeContextMenu: undefined,
    treeRootContextMenuAttached: false,
    projects: [],
    currentProjectId: undefined,
    pages: [],
    selectedPageId: undefined,
    selectedButtonId: undefined,
    selectedEventId: undefined,
    expandedPages: new Set(),
    expandedButtons: new Set(),
};

export function initializeState({ projects, currentProjectId, pages }) {
    state.projects = projects;
    state.currentProjectId = currentProjectId;
    state.pages = pages;
    state.selectedPageId = undefined;
    state.selectedButtonId = undefined;
    state.selectedEventId = undefined;
    state.expandedPages = new Set(pages.map((page) => page.data.id));
    state.expandedButtons = new Set();
}

export function currentProject() {
    return state.projects.find((project) => project.id === state.currentProjectId);
}

export function currentPage() {
    return state.pages.find((page) => page.data.id === state.selectedPageId);
}

export function ownerEvents() {
    const page = currentPage();
    if (!page || !state.selectedButtonId) return page?.data.events || null;
    const button = page.data.buttons.find((item) => item.id === state.selectedButtonId);
    return button?.events || null;
}

export function selectedElement() {
    const page = currentPage();
    if (!page) return null;
    if (state.selectedEventId) {
        const events = state.selectedButtonId
            ? page.data.buttons.find((button) => button.id === state.selectedButtonId)?.events
            : page.data.events;
        const event = events?.find((item) => item.id === state.selectedEventId);
        if (event) return { type: "event", value: event };
    }
    if (state.selectedButtonId) {
        const button = page.data.buttons.find((item) => item.id === state.selectedButtonId);
        if (button) return { type: "button", value: button };
    }
    return { type: "page", value: page };
}
