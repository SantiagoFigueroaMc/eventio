import { icons } from "../icons.js";
import { eventHeading } from "./dom.js";

export function createIcon(iconName, className = "item-icon") {
    const icon = document.createElement("span");
    icon.className = className;
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = icons[iconName];
    return icon;
}

export function setEditorHeading(iconName, label) {
    eventHeading.replaceChildren(createIcon(iconName, "editor-heading-icon"), document.createTextNode(label));
}
