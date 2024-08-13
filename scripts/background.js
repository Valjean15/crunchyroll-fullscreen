import { ALLOWED_SITE, storage, actions } from "./services.js";

// Apply changes when page was loaded
chrome.tabs.onUpdated.addListener(function (_, changeInfo, tab) {
    const
        { active, url } = tab,
        { status } = changeInfo;

    if (status == 'complete' && active && url && url.includes(ALLOWED_SITE)) {
        storage.loadChanges().then(state => {
            Object.keys(state).forEach(key => {
                actions[key](state[key]);
            });
        });
    }
})