import { logger } from './logger.js'

// Service to get elements from the extension document
export const search = {

    // Search cache
    cache: {},

    // Get input elements inside a label element with class "toggle"
    getToggles() {

        logger.print('[getToggles] Getting toggles elements');
        if (this.cache.toggles){
            logger.print('[getToggles] Using elements in cache', this.cache.toggles);
            return this.cache.toggles;
        }

        logger.print('[getToggles] Looking into the document => .toggle');
        this.cache.toggles = Array.from(document.querySelectorAll('.toggle'))
            .map(toggle => toggle.getElementsByTagName('input')[0])
            .filter(toggle => !!toggle)
            .map(toggle => {
                const { name } = toggle;
                return { name, element: toggle };
            });

        logger.print('[getToggles] Elements stored into cache', this.cache.toggles);
        return this.cache.toggles;
    },

    // Get select elements inside a label element with class "select"
    getSelectors() {

        logger.print('[getSelectors] Getting toggles elements');
        if (this.cache.selectors){
            logger.print('[getSelectors] Using elements in cache', this.cache.selectors);
            return this.cache.selectors;
        }

        logger.print('[getSelectors] Looking into the document => .select');
        this.cache.selectors = Array.from(document.querySelectorAll('.select'))
            .map(toggle => toggle.getElementsByTagName('select')[0])
            .filter(toggle => !!toggle)
            .map(toggle => {
                const { name } = toggle;
                return { name, element: toggle };
            });

        logger.print('[getSelectors] Elements stored into cache', this.cache.selectors);
        return this.cache.selectors;
    },

    // Get element that requite some translations, this elements have content start with "LNG_"
    getElementWithTranslations() {

        logger.print('[getElementWithTranslations] Getting elements to translate');
        if (this.cache.translate){
            logger.print('[getElementWithTranslations] Using elements in cache', this.cache.translate);
            return this.cache.translate;
        }

        const isValidToTranslate = (text) => text.startsWith('LNG_') && !text.includes('\n');

        this.cache.translate = Array.from(document.querySelectorAll("*"))
            .map(node => {
                let 
                    text = node.textContent?.trim() || '',
                    title = node.title?.trim() || '';

                return { 
                    element: node,
                    content: { key: text, isValid: isValidToTranslate(text) },
                    title: { key: title, isValid: isValidToTranslate(title) }
                }
            })        
            .filter(item => item.content.isValid || item.title.isValid)
        ;

        logger.print('[getElementWithTranslations] Elements stored into cache', this.cache.translate);
        return this.cache.translate;
    }
}
