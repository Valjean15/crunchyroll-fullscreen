import { BOOLEAN_VALUES, remote, storage, actions } from "./services.js";

// Apply changes when page was loaded
chrome.tabs.onUpdated.addListener(async function (_, changeInfo, tab) {
    const
        { active, url } = tab,
        { status } = changeInfo;

    if (status == 'complete' && active && remote.isAllowed(url)) {
        const state = await storage.loadChanges();

        // Meanwhile, only boolean values are avaible to action in background
        BOOLEAN_VALUES.forEach(key => actions[key](state[key]));
    }
})