import { currentProject, state } from "./state.js";

const imageDatabase = openImageDatabase();

export function bootstrapStorage() {
    const projects = JSON.parse(localStorage.getItem("eventio-projects") || "[]");
    const legacyPages = JSON.parse(localStorage.getItem("eventio-pages") || "[]");
    if (!projects.length) {
        projects.push({ id: crypto.randomUUID(), name: "Untitled project", pages: legacyPages });
        localStorage.setItem("eventio-projects", JSON.stringify(projects));
    }
    let currentProjectId = localStorage.getItem("eventio-current-project") || projects[0].id;
    if (!projects.some((project) => project.id === currentProjectId)) currentProjectId = projects[0].id;
    const pages = projects.find((project) => project.id === currentProjectId).pages;
    return { projects, currentProjectId, pages };
}

export function saveProjects() {
    localStorage.setItem("eventio-projects", JSON.stringify(state.projects));
    localStorage.setItem("eventio-current-project", state.currentProjectId);
}

export function savePages() {
    localStorage.setItem("eventio-pages", JSON.stringify(state.pages));
    const project = currentProject();
    project.pages = state.pages;
    localStorage.setItem("eventio-projects", JSON.stringify(state.projects));
    localStorage.setItem("eventio-current-project", state.currentProjectId);
}

export function openImageDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("eventio-images", 1);
        request.addEventListener("upgradeneeded", () => {
            request.result.createObjectStore("images");
        });
        request.addEventListener("success", () => resolve(request.result));
        request.addEventListener("error", () => reject(request.error));
    });
}

export async function storeImage(imageId, blob) {
    const database = await imageDatabase;
    return new Promise((resolve, reject) => {
        const transaction = database.transaction("images", "readwrite");
        transaction.objectStore("images").put(blob, imageId);
        transaction.addEventListener("complete", resolve);
        transaction.addEventListener("error", () => reject(transaction.error));
    });
}

export async function loadImage(imageId) {
    const database = await imageDatabase;
    return new Promise((resolve, reject) => {
        const transaction = database.transaction("images", "readonly");
        const request = transaction.objectStore("images").get(imageId);
        request.addEventListener("success", () => resolve(request.result));
        request.addEventListener("error", () => reject(request.error));
    });
}

export async function migrateImages() {
    const imageMigrations = [];
    state.projects.forEach((project) => {
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
    localStorage.setItem("eventio-projects", JSON.stringify(state.projects));
}
