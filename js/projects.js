import { projectList, projectModal, projectPickerLabel, elementCounter } from "./dom.js";
import { createIcon } from "./icon-utils.js";
import { currentProject, state } from "./state.js";
import { saveProjects } from "./storage.js";
import { render } from "./render.js";
import { shareProject } from "./zip.js";

export function countElements() {
    return state.pages.reduce((total, page) => total + 1 + page.data.buttons.reduce(
        (buttonTotal, button) => buttonTotal + 1 + button.events.length,
        0,
    ) + page.data.events.length, 0);
}

export function renderProjectStatus() {
    projectPickerLabel.textContent = currentProject().name;
    elementCounter.textContent = `${countElements()} elements`;
}

export function renderProjectList() {
    projectList.replaceChildren();
    state.projects.forEach((project) => {
        const row = document.createElement("div");
        row.className = `project-row${project.id === state.currentProjectId ? " is-active" : ""}`;
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
        remove.disabled = state.projects.length === 1;
        remove.addEventListener("click", () => deleteProject(project));
        row.append(select, edit, share, remove);
        projectList.append(row);
    });
}

export function switchProject(projectId) {
    state.currentProjectId = projectId;
    state.pages = currentProject().pages;
    state.selectedPageId = undefined;
    state.selectedButtonId = undefined;
    state.selectedEventId = undefined;
    localStorage.setItem("eventio-current-project", state.currentProjectId);
    render();
    projectModal.close();
}

export function createProject() {
    const project = { id: crypto.randomUUID(), name: `Project ${state.projects.length + 1}`, pages: [] };
    state.projects.push(project);
    switchProject(project.id);
}

export function renameProject(project, row, select) {
    const input = document.createElement("input");
    input.className = "project-name-input";
    input.value = project.name;
    row.replaceChild(input, select);
    input.focus();
    input.select();
    const saveName = () => {
        project.name = input.value.trim() || project.name;
        saveProjects();
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

export function deleteProject(project) {
    if (state.projects.length === 1 || !window.confirm(`Delete "${project.name}"?`)) return;
    const index = state.projects.findIndex((item) => item.id === project.id);
    state.projects.splice(index, 1);
    if (project.id === state.currentProjectId) {
        state.currentProjectId = state.projects[0].id;
        state.pages = currentProject().pages;
        state.selectedPageId = undefined;
        state.selectedButtonId = undefined;
        state.selectedEventId = undefined;
    }
    localStorage.setItem("eventio-projects", JSON.stringify(state.projects));
    render();
    renderProjectList();
}
