import { icons } from "./icons.js";
import {
    addPageButton,
    closeProjectModalButton,
    createProjectButton,
    dataIconElements,
    imageInput,
    importProjectButton,
    importProjectInput,
    mainPanel,
    projectModal,
    projectPicker,
    splitters,
    toggleImageButtons,
    toggleImageButtonsIcon,
} from "./js/dom.js";
import { initializeState, state, currentPage } from "./js/state.js";
import { bootstrapStorage, migrateImages } from "./js/storage.js";
import { render } from "./js/render.js";
import {
    createPage,
    readImage,
    startTemporaryImageButtonsHide,
    stopTemporaryImageButtonsHide,
    togglePersistentImageButtons,
} from "./js/canvas.js";
import { closeTreeContextMenu } from "./js/tree.js";
import { createProject, renderProjectList } from "./js/projects.js";
import { importProjectFile } from "./js/zip.js";
import { startResize } from "./js/resize.js";

initializeState(bootstrapStorage());

addPageButton.addEventListener("click", createPage);
projectPicker.addEventListener("click", () => {
    renderProjectList();
    projectModal.showModal();
});
closeProjectModalButton.addEventListener("click", () => projectModal.close());
createProjectButton.addEventListener("click", createProject);
importProjectButton.addEventListener("click", () => importProjectInput.click());
importProjectInput.addEventListener("change", (event) => {
    const file = event.target.files[0];
    importProjectInput.value = "";
    if (file) importProjectFile(file);
});
dataIconElements.forEach((element) => {
    element.innerHTML = icons[element.dataset.icon];
});
toggleImageButtonsIcon.dataset.icon = "eye";
toggleImageButtonsIcon.innerHTML = icons.eye;
toggleImageButtons.addEventListener("pointerdown", startTemporaryImageButtonsHide);
toggleImageButtons.addEventListener("pointerup", stopTemporaryImageButtonsHide);
toggleImageButtons.addEventListener("pointercancel", (event) => {
    stopTemporaryImageButtonsHide(event);
    state.suppressImageButtonsClick = false;
});
toggleImageButtons.addEventListener("click", togglePersistentImageButtons);
imageInput.addEventListener("change", (event) => readImage(event.target.files[0]));
document.addEventListener("pointerdown", (event) => {
    if (state.treeContextMenu && !state.treeContextMenu.contains(event.target)) {
        closeTreeContextMenu();
    }
});
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.treeContextMenu) {
        closeTreeContextMenu();
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

splitters.forEach((splitter, splitterIndex) => {
    splitter.addEventListener("pointerdown", (event) => startResize(splitter, splitterIndex, event));
});
