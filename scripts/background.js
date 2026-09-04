import { remote, storage, session } from "./services.js";

/**
 * Re-applies the stored options to a Crunchyroll tab.
 *
 * The tab id comes from the event rather than from a query for the active
 * tab, so a page that loads in the background, or while another window has
 * focus, is still handled.
 *
 * @param {number} tabId Tab that finished loading or navigating.
 * @param {string} [url] Url of that tab, when the caller already has it.
 * @returns {Promise<void>} Resolves once the options have been applied.
 */
const restore = async (tabId, url) => {

    if (!remote.isAllowed(url)) return;

    const state = await storage.loadChanges();
    await session.applyAll(state, tabId);
};

// Full document loads, including reloads.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete') restore(tabId, tab?.url);
});

// Episode changes, which Crunchyroll routes without reloading the document.
chrome.webNavigation.onHistoryStateUpdated.addListener(({ tabId, frameId, url }) => {
    if (frameId === 0) restore(tabId, url);
});
