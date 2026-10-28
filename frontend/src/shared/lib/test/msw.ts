import { setupServer } from "msw/node";

// Each test declares its own network with server.use(); an unhandled request fails the test.
export const server = setupServer();
