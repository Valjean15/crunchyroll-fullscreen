import { storage, actions } from "./services.js";

const search = {
    cache: {},

    getToggles() {
        if (this.cache.toggles)
            return this.cache.toggles;

        this.cache.toggles = Array.from(document.querySelectorAll('.toggle'))
            .map(toggle => toggle.getElementsByTagName('input')[0])
            .filter(toggle => !!toggle)
            .map(toggle => {
                const { name } = toggle;
                return { name, element: toggle };
            });

        return this.cache.toggles;
    }
}

// Set events for the components
search.getToggles().forEach(({ name, element }) => {
    element.addEventListener('change', (event) => {
        const
            { checked } = event.target,
            action = actions[name];

        if (action)
            action(checked, event.target)
                .then(() => storage.saveChanges(name, checked))
                .catch(() => element.checked = false)
    })
});

//  Update component visual state using the last saved state
storage.loadChanges().then(state => {
    const toggles = search.getToggles();
    Object.keys(state).forEach(key => {
        const { element } = toggles.find(toggle => toggle.name === key);
        element.checked = state[key];
    });
});