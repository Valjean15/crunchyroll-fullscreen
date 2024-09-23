// Just for control
const DEBUG_ALLOWED = false;

export const logger = {
    print (message, data) {
        if (DEBUG_ALLOWED)
            console.info(`DEBUG :: ${message}`, data ?? undefined);
    }
} 