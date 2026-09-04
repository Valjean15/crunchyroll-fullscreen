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
const ENABLE_PIP = 'enable-pip';

// Clasify values by type
export const BOOLEAN_VALUES = [HIDE_HEADER, EXPAND_VIDEO_PLAYER, AUTO_SKIP_BUTTON, ENABLE_PIP];
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

    /**
     * Checks whether a url belongs to the site this extension supports.
     *
     * @param {string} [url] Url to test.
     * @returns {boolean} True when the url is a Crunchyroll page.
     */
    isAllowed(url) {
        return !!url && url.includes(ALLOWED_SITE);
    },

    /**
     * Runs a function inside a Crunchyroll tab.
     *
     * The injection is awaited so that a failure is reported to the caller.
     * Earlier versions fired it and returned success immediately, which hid
     * every permission and targeting error behind a resolved promise.
     *
     * @param {Array} args Arguments forwarded to the injected function.
     * @param {Function} action Function serialised and executed in the page.
     * @param {number} [tabId] Tab to target, defaulting to the active tab.
     * @returns {Promise<void>} Resolves once the script has run.
     */
    async execute(args, action, tabId) {
        try {
            const tab = tabId === undefined
                ? (await chrome.tabs.query({ active: true, currentWindow: true }))[0]
                : await chrome.tabs.get(tabId);

            const { id, url } = (tab || {});
            logger.print('[execute] Tab detected', { id, url });

            if (!this.isAllowed(url)) {
                logger.print('[execute] Invalid tab due to url', { id, url });
                return Promise.reject('Page not allowed for this extension');
            }

            await chrome.scripting.executeScript({
                target: { tabId: id },
                func: action,
                args: args
            });

            logger.print('[execute] Success on executing remote script on tab', { id });

        } catch (ex) {
            logger.print('[execute] Failure on executing remote script on tab', ex);
            return Promise.reject(ex?.message || 'Page not allowed for this extension');
        }
    },
    async executeIntoVideoPlayer(args, action) {
        try {
            const
                [tab] = await chrome.tabs.query({ active: true, currentWindow: true }),
                { id, url } = (tab || {});

            if (!this.isAllowed(url)) {
                logger.print('[executeIntoFrame] Invalid tab due to url');
                return Promise.reject('Page not allowed for this extension');
            }

            logger.print('[executeIntoFrame] Tab detected', { id, url });

            const
                frames = await chrome.webNavigation.getAllFrames({ tabId: id }),
                player = (frames || []).filter(frame => frame.frameType === 'sub_frame' && frame.url.includes('static')).at(0)
                ;

            if (!player) {
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

/**
 * Handlers for controls changed in the popup.
 *
 * Each key matches the name of a control in the popup document.
 */
export const actions = {

    // Toggles
    [HIDE_HEADER]: (checked) => adjustScreen(checked, STATE_CACHE.get()[EXPAND_VIDEO_PLAYER]),

    [EXPAND_VIDEO_PLAYER]: (checked) => adjustScreen(STATE_CACHE.get()[HIDE_HEADER], checked),

    [AUTO_SKIP_BUTTON]: (checked) => applyAutoSkip(checked),

    [ENABLE_PIP]: (checked) => applyPictureInPicture(checked, true),

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

/**
 * Re-applies stored options to a tab, outside of any popup interaction.
 */
export const session = {

    /**
     * Applies every stored option to one tab.
     *
     * Picture-in-picture is only unblocked here and never opened, because a
     * page load carries no user activation and the request would throw.
     *
     * @param {Object} state Stored option values.
     * @param {number} tabId Tab to apply the options to.
     * @returns {Promise<PromiseSettledResult[]>} Settles once all have run.
     */
    applyAll(state, tabId) {
        logger.print('[applyAll] Applying stored options', { tabId, state });

        return Promise.allSettled([
            adjustScreen(state[HIDE_HEADER], state[EXPAND_VIDEO_PLAYER], tabId),
            applyAutoSkip(state[AUTO_SKIP_BUTTON], tabId),
            applyPictureInPicture(state[ENABLE_PIP], false, tabId)
        ]);
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

// Both screen tweaks are injected as one script. Crunchyroll is a single page
// app: the header and the player mount after the page reports 'complete', and
// they are swapped out again when moving between episodes. Reading the DOM once
// therefore misses them, which is why a freshly loaded page used to ignore the
// saved state until the toggle was flipped by hand. A single rAF-debounced
// observer keeps both in sync, and every run disposes the previous one so
// nothing accumulates across re-injections.
/**
 * Applies the header and video player tweaks to a Crunchyroll tab.
 *
 * Both live in one injected script because they share a single observer.
 * Crunchyroll mounts its header and player after the document reports
 * 'complete' and swaps them out again between episodes, so reading the DOM
 * once misses them. Every run disposes the previous one, so repeated
 * injections never stack observers or listeners.
 *
 * @param {boolean} hideHeader Whether the site header should be hidden.
 * @param {boolean} expandVideoPlayer Whether the player should fill the screen.
 * @param {number} [tabId] Tab to target, defaulting to the active tab.
 * @returns {Promise<void>} Resolves once the script has run.
 */
const adjustScreen = (hideHeader, expandVideoPlayer, tabId) =>

    remote.execute([hideHeader, expandVideoPlayer], (hideHeader, expandVideoPlayer) => {

        const
            HEADER = 'erc-large-header',
            PLAYER = 'video-player-wrapper';

        if (window.__crFullscreen)
            window.__crFullscreen.dispose();

        // Retire the resize listener left behind by earlier versions, for
        // tabs that were already open when the extension was updated.
        if (window.__adjustVideoPlayerHeight) {
            window.removeEventListener('resize', window.__adjustVideoPlayerHeight);
            delete window.__adjustVideoPlayerHeight;
        }

        const
            headerOf = () => document.getElementsByClassName(HEADER)[0]?.parentElement,
            playerOf = () => document.getElementsByClassName(PLAYER)[0];

        let sized = null, sizedValue = '', observer = null;

        /**
         * Shows or hides the header.
         *
         * @returns {boolean} True when the visibility changed, which moves the
         *                    player and therefore invalidates its height.
         */
        const applyHeader = () => {
            const element = headerOf();
            if (!element) return false;

            const wanted = hideHeader ? 'none' : '';
            if (element.style.display === wanted) return false;

            element.style.display = wanted;
            return true;
        };

        /**
         * Sizes the player to the space left below it, or restores it.
         *
         * @param {boolean} force Recompute even if this element looks current.
         */
        const applyPlayer = (force) => {
            const element = playerOf();

            if (!element) {
                sized = null;
                return;
            }

            if (!expandVideoPlayer) {
                if (element.style.height) element.style.height = '';
                sized = null;
                return;
            }

            if (!force && sized === element && element.style.height === sizedValue)
                return;

            const available = window.innerHeight - element.getBoundingClientRect().top;
            element.style.height = `${available}px`;

            // Watch this one element's style attribute, so the height comes
            // back if the site re-renders over it.
            if (sized !== element && observer)
                observer.observe(element, { attributes: true, attributeFilter: ['style'] });

            sized = element;
            sizedValue = element.style.height;
        };

        const apply = (force) => applyPlayer(applyHeader() || force);

        if (!hideHeader && !expandVideoPlayer) {
            apply(true);
            return;
        }

        let queued = false, forceNext = false;

        /**
         * Coalesces work into one pass per animation frame.
         *
         * @param {boolean} force Whether the pass must recompute the height.
         */
        const schedule = (force) => {
            if (force) forceNext = true;
            if (queued) return;

            queued = true;
            requestAnimationFrame(() => {
                queued = false;

                const force = forceNext;
                forceNext = false;
                apply(force);
            });
        };

        const
            onMutation = () => schedule(false),
            onResize = () => schedule(true);

        observer = new MutationObserver(onMutation);
        observer.observe(document.documentElement, { childList: true, subtree: true });
        window.addEventListener('resize', onResize);

        window.__crFullscreen = {
            dispose() {
                observer.disconnect();
                window.removeEventListener('resize', onResize);
                delete window.__crFullscreen;
            }
        };

        apply(true);
    }, tabId);

/**
 * Starts or stops clicking Crunchyroll's skip intro/credits button.
 *
 * @param {boolean} enabled Whether the button should be clicked automatically.
 * @param {number} [tabId] Tab to target, defaulting to the active tab.
 * @returns {Promise<void>} Resolves once the script has run.
 */
const applyAutoSkip = (enabled, tabId) =>

    remote.execute([enabled], (enabled) => {

        clearInterval(window.__auto_skip_button);
        window.__auto_skip_button = null;

        if (!enabled) return;

        window.__auto_skip_button = setInterval(async () => {

            const skip = document.querySelector("[data-testid='player-controls-root'] > button");
            if (skip && skip.click) {
                skip.click();

                // Wait at least a second before trying again.
                await (() => new Promise(r => setTimeout(r, 1000)))();
            }

        }, 1000);
    }, tabId);

/**
 * Unblocks or re-blocks picture-in-picture for the page's video element.
 *
 * Crunchyroll sets disablePictureInPicture on its player. Clearing that flag
 * is the only part of this that works without user activation, so opening the
 * window is attempted only when the popup asks for it; a page load carries no
 * activation and would just throw. The video mounts after load and is replaced
 * between episodes, so the flag is re-applied to whichever video is current.
 *
 * @param {boolean} allowed Whether picture-in-picture should be available.
 * @param {boolean} enter Whether to also open the window straight away.
 * @param {number} [tabId] Tab to target, defaulting to the active tab.
 * @returns {Promise<void>} Resolves once the script has run.
 */
const applyPictureInPicture = (allowed, enter, tabId) =>

    remote.execute([allowed, enter], (allowed, enter) => {

        if (window.__crPictureInPicture)
            window.__crPictureInPicture.dispose();

        const videoOf = () => document.getElementsByTagName('video')[0];
        const video = videoOf();

        if (video) video.disablePictureInPicture = !allowed;

        // Leaving never needs a gesture, unlike entering.
        if (!allowed && document.pictureInPictureElement)
            document.exitPictureInPicture().catch(() => { });

        if (!allowed) return;

        if (enter && video)
            video.requestPictureInPicture().catch(error =>
                console.warn('[Crunchyroll - Fullscreen] Could not open picture-in-picture', error?.name));

        let seen = video || null, queued = false;

        const schedule = () => {
            if (queued) return;

            queued = true;
            requestAnimationFrame(() => {
                queued = false;

                const current = videoOf();
                if (!current || current === seen) return;

                seen = current;
                current.disablePictureInPicture = false;
            });
        };

        const observer = new MutationObserver(schedule);
        observer.observe(document.documentElement, { childList: true, subtree: true });

        window.__crPictureInPicture = {
            dispose() {
                observer.disconnect();
                delete window.__crPictureInPicture;
            }
        };
    }, tabId);

// #endregion