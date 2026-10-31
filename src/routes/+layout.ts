// The browser calls merton-api itself (same origin, no BFF) and only the API can
// tell who is signed in, so pages render on the client. The server sends the shell.
export const ssr = false;
