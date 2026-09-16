import { state } from "./state.js";
import { loadImage, saveProjects, storeImage } from "./storage.js";
import { renderProjectList, switchProject } from "./projects.js";

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

export async function shareProject(project) {
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
    const existingNames = new Set(state.projects.map((project) => project.name));
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

export async function importProjectFile(file) {
    try {
        const isZip = file.name.toLowerCase().endsWith(".zip") || file.type === "application/zip";
        const project = isZip ? await importProjectFromZip(file) : await importProjectFromJson(file);
        state.projects.push(project);
        switchProject(project.id);
        saveProjects();
        renderProjectList();
    } catch (error) {
        console.error("Unable to import project.", error);
        window.alert("Unable to import the project. Make sure the file is a valid Eventio export.");
    }
}
