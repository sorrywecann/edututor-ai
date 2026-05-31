// Preload — runs with Node access before the page loads, bridges a minimal,
// safe API to the renderer via contextBridge. Kept tiny for now; grows as the
// shell needs to expose launcher state (boot progress, restart, logs) to the UI.
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('eduLauncher', {
  isDesktop: true,
  version: process.env.npm_package_version || '0.1.0',
});
