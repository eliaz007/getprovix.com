import WebSocket from "ws";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- ws polyfill for Supabase realtime in Node tests
(globalThis as any).WebSocket = WebSocket;
