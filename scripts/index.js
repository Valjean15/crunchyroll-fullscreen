import { storage, actions, translation } from "./services.js";
import { search } from "./query.js";
import { logger } from "./logger.js";

// Load values
const state = await storage.loadChanges();
const translations = await translation.get(state);

// Apply language for each element
translation.apply(search.getElementWithTranslations(), translations);

// Report the installed build straight from the manifest, so it cannot drift
const about = search.getAboutSection();
if (about) {
    const { version, version_name } = chrome.runtime.getManifest();
    about.textContent = version_name || `v${version}`;
}

// Load element to use
const
    toggles = search.getToggles(),
    selectors = search.getSelectors();

/**
 * Runs the handler for a control and stores its new value.
 *
 * The rejection is caught here because a handler fails whenever the page
 * cannot be reached, and that must not stop the value from being saved.
 *
 * @param {string} name Name of the control that changed.
 * @param {*} value New value of the control.
 * @param {HTMLElement} element Control that raised the event.
 */
const handleChange = (name, value, element) => {

    const action = actions[name];
    if (!action) return;

    action(value, element)
        .catch(error => logger.print('[handleChange] Action failed => ', error))
        .finally(() => storage.saveChanges(name, value));
};

// Update visual state and add listeners to each element
toggles.forEach(({ name, element }) => {

    // Visual update
    element.checked = state[name];

    // Listener
    element.addEventListener('change', (event) => handleChange(name, event.target.checked, event.target));
});

selectors.forEach(({ name, element }) => {

    // Visual update
    element.value = state[name];

    // Listener
    element.addEventListener('change', (event) => handleChange(name, event.target.value, event.target));
});
