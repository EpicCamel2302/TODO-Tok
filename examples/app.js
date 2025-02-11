// TODO: Implement user authentication
function login() {
    /* FIXME: Add password validation */
    const username = getUsername();

    /**
     * TODO_OPTIMIZE: Improve performance of token generation
     * This is currently using a slow algorithm
     */
    generateToken();

    // HACK: Temporary workaround for session handling
    handleSession();
}

/*
 * XXX: This entire function needs to be refactored
 * It's becoming too complex
 */
function handleSession() {
    // TO-DO: Add session timeout
    setupSession();
}
