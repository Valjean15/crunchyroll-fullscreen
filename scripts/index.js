import { storage, actions, translation } from "./services.js";
import { search } from "./query.js";

// Load values
const state = await storage.loadChanges();
const translations = await translation.get(state);

// Apply language for each element
translation.apply(search.getElementWithTranslations(), translations);

// Load element to use
const
    toggles = search.getToggles(),
    selectors = search.getSelectors();

// Update visual state and add listeners to each element
toggles.forEach(({ name, element }) => {

    // Visual update
    element.checked = state[name];

    // Listener
    element.addEventListener('change', (event) => {
        const
            { checked } = event.target,
            action = actions[name];

        if (action)
            action(checked, event.target)
                .finally(() => storage.saveChanges(name, checked))
    })
});

selectors.forEach(({ name, element }) => {

    // Visual update
    element.value = state[name];

    // Listener
    element.addEventListener('change', (event) => {
        const
            { value } = event.target,
            action = actions[name];

        if (action)
            action(value, event.target)
                .finally(() => storage.saveChanges(name, value))
    })
});