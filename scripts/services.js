import { logger } from './logger.js'
import { search } from './query.js'

// #region Constants

const ALLOWED_SITE = 'https://www.crunchyroll.com';
const DEFAULT_LANGUAGE = 'en';

// Keys
const HIDE_HEADER = 'hide-header';
const EXPAND_VIDEO_PLAYER = 'expand-video-player';
const AUTO_SKIP_BUTTON = 'auto-skip-button';
const PREFERENCE_LANGUAGE = 'pref-language';

// Clasify values by type
export const BOOLEAN_VALUES = [HIDE_HEADER, EXPAND_VIDEO_PLAYER, AUTO_SKIP_BUTTON];
const STRING_VALUES = [PREFERENCE_LANGUAGE];
const ALL_VALUES = [...BOOLEAN_VALUES, ...STRING_VALUES]

// #endregion

// #region Private fields

// Represent the current state of the application
const STATE_CACHE = {

    __cache: {},

    set(value) {
        logger.print('[STATE_CACHE] Setting => ', value);
        this.__cache = value;
    },

    get() {
        logger.print('[STATE_CACHE] Getting => ', this.__cache);
        return this.__cache;
    },

    patch(key, value) {
        logger.print('[STATE_CACHE] Patching => ', { key, value });
        this.__cache[key] = value;
    }
}

// #endregion

export const remote = {
    isAllowed(url) {
        return url && url.includes(ALLOWED_SITE);
    },
    async execute(args, action) {
        try {
            const
                [tab] = await chrome.tabs.query({ active: true, currentWindow: true }),
                { id, url } = tab;

            logger.print('[execute] Tab detected', { id, url });

            if (!this.isAllowed(url)) {
                logger.print('[execute] Invalid tab due to url');
                return Promise.reject('Page not allowed for this extension');
            }

            logger.print('[execute] Executing remote script on tab');

            chrome.scripting.executeScript({
                target: { tabId: id },
                func: action,
                args: args
            });

            logger.print('[execute] Success on executing remote script on tab');
            return Promise.resolve();

        } catch (ex) {
            logger.print('[execute] Failure on executing remote script on tab', ex);
            return Promise.reject('Page not allowed for this extension');
        }
    },
    async executeIntoVideoPlayer(args, action) {
        try {
            const
                [tab] = await chrome.tabs.query({ active: true, currentWindow: true }),
                { id, url } = tab;

            if (!this.isAllowed(url)) {
                logger.print('[executeIntoFrame] Invalid tab due to url');
                return Promise.reject('Page not allowed for this extension');
            }

            logger.print('[executeIntoFrame] Tab detected', { id, url });

            const 
                frames = await chrome.webNavigation.getAllFrames({ tabId: id }),
                player = (frames || []).filter(frame => frame.frameType === 'sub_frame' && frame.url.includes('static')).at(0)
                ;

            if (!player){
                logger.print('[executeIntoFrame] Cannot get the iframe of the video player');
                return Promise.reject('Video player not found');
            }

            logger.print('[executeIntoFrame] Video player detected', { id: player.frameId, url: player.url });

            chrome.scripting.executeScript({
                target: { tabId: id, frameIds: [player.frameId] },
                func: action,
                args: args
            });

            logger.print('[executeIntoFrame] Success on executing remote script on tab');
            return Promise.resolve();

        } catch (ex) {
            logger.print('[executeIntoFrame] Failure on executing remote script on tab', ex);
            return Promise.reject('Page not allowed for this extension');
        }
    }
}

export const storage = {
    saveChanges(key, value) {
        logger.print('[saveChanges] Saving => ', { key, value });
        STATE_CACHE.patch(key, value);
        chrome.storage.local.set({ [key]: value });
    },
    loadChanges() {
        logger.print('[loadChanges] Loading');
        return chrome.storage.local.get(ALL_VALUES)
            .then(saved => {
                let state = {};
                BOOLEAN_VALUES.forEach(key => state[key] = saved[key] ?? false);
                STRING_VALUES.forEach(key => state[key] = saved[key] ?? '');

                // Cases with specific default value
                if (!state[PREFERENCE_LANGUAGE]) state[PREFERENCE_LANGUAGE] = DEFAULT_LANGUAGE;

                logger.print('[loadChanges] Loaded', state);
                STATE_CACHE.set(state);

                return STATE_CACHE.get();
            });
    }
}

export const actions = {

    // Toggles 
    [HIDE_HEADER]: (checked) => adjustScreen(checked, STATE_CACHE.get()[EXPAND_VIDEO_PLAYER]),

    [EXPAND_VIDEO_PLAYER]: (checked) => adjustScreen(STATE_CACHE.get()[HIDE_HEADER], checked),

    [AUTO_SKIP_BUTTON]: (checked) => remote.executeIntoVideoPlayer([checked], checked => {

        clearInterval(window.__auto_skip_button);
        window.__auto_skip_button = null;

        if (checked)
            window.__auto_skip_button = setInterval(async () => {

                const skip = document.querySelector("[data-testid='skipIntroText']");
                if (skip && skip.click){
                    skip.click();
                    
                    // Wait at least a second before try again
                    await (() => new Promise(r => setTimeout(r, 1000)))();
                }
    
            }, 1000);
    }),

    // Selectors
    [PREFERENCE_LANGUAGE]: async (value) => {
        // Change value

        let translations = await translation.get({ [PREFERENCE_LANGUAGE]: value });
        if (!translations) {
            logger.print('[PREFERENCE_LANGUAGE] Translations do not exist for  => ', value);
            logger.print('[PREFERENCE_LANGUAGE] Using fallback language => ', DEFAULT_LANGUAGE);
            translations = await translation.get(DEFAULT_LANGUAGE);
        }

        translation.apply(search.getElementWithTranslations(), translations);

        return Promise.resolve();
    }
}

export const translation = {
    async get(state) {

        let language = state[PREFERENCE_LANGUAGE];
        logger.print('[translation] Getting translation for => ', language || 'undefined language');

        if (!language) {
            logger.print('[translation] Using fallback language => ', DEFAULT_LANGUAGE);
            language = DEFAULT_LANGUAGE;
        }

        const translations = await import(`../languages/${language}.js`).then(module => module.translation);
        logger.print('[translation] Language loaded => ', translations);

        return translations;
    },

    apply(elements, translations) {
        elements.forEach(({ element, content, title }) => {

            const get = (key) => {
                const value = translations[key];
                if (!value) {
                    logger.print('[translation] Value not found => ', key);
                    return key;
                }
                return value;
            }
            
            if (content.isValid)
                element.textContent = get(content.key);

            if (title.isValid)
                element.title = get(title.key);
        });
    }
}

// #region Private Methods

const adjustScreen = async (hideHeader, expandVideoPlayer) => {
    
    // Hide/Show header if checked
    const hideHeaderPromise = remote.execute([hideHeader], checked => {

        const { style } = document.getElementsByClassName('erc-large-header')[0];

        if (checked && style.display !== 'none')
            style.display = 'none';

        if (!checked && style.display !== '')
            style.display = '';
    })

    // Adjust the video player, if the current value is checked
    const expandVideoPlayerPromise = remote.execute([expandVideoPlayer], checked => {

        const videoPlayer = document.getElementsByClassName('video-player-wrapper')[0];
        if (videoPlayer) {
    
            // Function to adjust the video player's height dynamically
            const adjustHeight = () => {
                const viewportHeight = window.innerHeight;
                const offsetTop = videoPlayer.getBoundingClientRect().top;
                const availableHeight = viewportHeight - offsetTop;
                videoPlayer.style.height = `${availableHeight}px`;
            };
    
            if (checked) {
                // Store the function reference to remove it later
                window.__adjustVideoPlayerHeight = adjustHeight;
                // Add event listener to adjust height on window resize
                window.addEventListener('resize', window.__adjustVideoPlayerHeight);
                // Initial adjustment
                window.__adjustVideoPlayerHeight();
            } else {
                // Remove the event listener when unchecked
                if (window.__adjustVideoPlayerHeight) {
                    window.removeEventListener('resize', window.__adjustVideoPlayerHeight);
                    delete window.__adjustVideoPlayerHeight;
                }
                // Reset the height
                videoPlayer.style.height = '';
            }
        }
    })

    const noError = (await Promise.allSettled([hideHeaderPromise, expandVideoPlayerPromise]))
        .every(result => result.status === 'fulfilled');

    return noError ? Promise.resolve() : Promise.reject();
}

// #endregion