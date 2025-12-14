// Lightweight reusable Socket.IO client singleton
// - Uses server domain from settings when available
// - Exposes join/leave helpers and event on/off wrappers

import {getSetting} from '@/utils/settings';

let socket = null;
let connectedDomain = null;
const listeners = new Set();
let socketIoClient = null;
let importPromise = null;

export function getServerUrl() {
  // Prefer configured server domain; fallback to env; then current origin
  const cfg = getSetting('server.domain');
  const envUrl = import.meta?.env?.VITE_SERVER_URL;
  return cfg || envUrl || window.location.origin;
}

export async function getSocket() {
  const serverUrl = getServerUrl();
  if (!socket || connectedDomain !== serverUrl) {
    if (socket) {
      try {
        socket.disconnect();
      } catch (e) {
        void e; // ignore
      }
      socket = null;
    }

    // Dynamically import socket.io-client with race condition protection
    if (!socketIoClient) {
      if (!importPromise) {
        importPromise = import('socket.io-client');
      }
      socketIoClient = (await importPromise).io;
    }

    // Double check socket didn't get created by another concurrent call while we awaited
    if (socket && connectedDomain === serverUrl) {
        return socket;
    }

    connectedDomain = serverUrl;
    socket = socketIoClient(serverUrl, {transports:  ["polling","websocket"]});

    // Re-attach previously registered event handlers on new socket instance
    listeners.forEach(({event, handler}) => {
      socket.on(event, handler);
    });
  }
  return socket;
}

export async function on(event, handler) {
  const s = await getSocket();
  s.on(event, handler);
  listeners.add({event, handler});
  return () => off(event, handler);
}

export async function off(event, handler) {
  if (!socket) return;
  socket.off(event, handler);
  // Remove only matching entry
  for (const item of Array.from(listeners)) {
    if (item.event === event && item.handler === handler) {
      listeners.delete(item);
    }
  }
}

export async function joinToken(token) {
  const s = await getSocket();
  if (!token) return;
  s.emit('join-token', {token});
}

export async function leaveToken(token) {
  if (!socket) return;
  socket.emit('leave-token', {token});
}

export async function leaveAll() {
  if (!socket) return;
  socket.emit('leave-all');
}

export async function onConnect(handler) {
  const s = await getSocket();
  s.on('connect', handler);
  return () => s.off('connect', handler);
}

export async function sendEvent(type, content = null) {
  const s = await getSocket();
  s.emit('send-event', {
    type,
    content
  });
}

export async function disconnect() {
  if (!socket) return;
  try {
    socket.disconnect();
  } catch (e) {
    void e; // ignore
  }
  socket = null;
  connectedDomain = null;
  listeners.clear();
}
