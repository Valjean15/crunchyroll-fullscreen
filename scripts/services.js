// #region Constants

export const ALLOWED_SITE = 'www.crunchyroll.com';

const HIDE_HEADER = 'hide-header';
const EXPAND_VIDEO_PLAYER = 'expand-video-player';
const SAVE_KEYS = [HIDE_HEADER, EXPAND_VIDEO_PLAYER];

// #endregion

const remote = {
    async execute(args, action) {
        try {
            const
                [tab] = await chrome.tabs.query({ active: true, currentWindow: true }),
                { id, url } = tab;

            if (!url || !url.includes(ALLOWED_SITE))
                return Promise.reject('Page not allowed for this extension');

            // Execute remote script
            chrome.scripting.executeScript({
                target: { tabId: id },
                func: action,
                args: args
            });

            return Promise.resolve();

        } catch {
            return Promise.reject('Page not allowed for this extension');
        }
    }
}

export const storage = {
    saveChanges(key, value) {
        chrome.storage.local.set({ [key]: value });
    },
    loadChanges() {
        return chrome.storage.local.get(SAVE_KEYS)
            .then(saved => {
                let state = {};
                SAVE_KEYS.forEach(key => state[key] = saved[key] ?? false);
                return state;
            });
    }
}

export const actions = {

    // Toggles 
    [HIDE_HEADER]: (checked) => remote.execute([checked], checked => {

        const { style } = document.getElementsByClassName('erc-large-header')[0];

        if (checked && style.display !== 'none')
            style.display = 'none';

        if (!checked && style.display !== '')
            style.display = '';
    }),

    [EXPAND_VIDEO_PLAYER]: (checked) => remote.execute([checked], checked => {

        const { style } = document.getElementsByClassName('video-player-wrapper')[0];

        if (checked && style.height !== '100vh')
            style.height = '100vh';

        if (!checked && style.height !== '')
            style.height = '';
    })
}