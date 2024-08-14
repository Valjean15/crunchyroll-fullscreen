// Just for control
const DEBUG_ALLOWED = true;

export const logger = {
    print (message, data) {
        if (DEBUG_ALLOWED)
            console.info(`DEBUG :: ${message}`, data ?? {});
    }
} 