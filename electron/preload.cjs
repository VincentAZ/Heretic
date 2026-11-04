// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2025-2026 Philipp Emanuel Weidmann (<pew@worldwidemann.com>) + contributors (Upstream Heretic Core)
// Copyright (C) 2026 Vincent Serpico (Heretic Studio Desktop UI & Engine Integration, modified/extended 2026-11-03)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hereticAPI', {
  // Telemetry & Environment
  getHardwareTelemetry: () => ipcRenderer.invoke('heretic:getHardwareTelemetry'),
  getEnvironmentStatus: () => ipcRenderer.invoke('heretic:getEnvironmentStatus'),
  estimateModelMemory: (modelName, quantization, paramCountB) =>
    ipcRenderer.invoke('heretic:estimateModelMemory', modelName, quantization, paramCountB),

  // Presets & TOML Configs
  getPresets: () => ipcRenderer.invoke('heretic:getPresets'),
  saveCustomPreset: (name, description, tomlContent) =>
    ipcRenderer.invoke('heretic:saveCustomPreset', name, description, tomlContent),
  readConfigToml: (filePath) => ipcRenderer.invoke('heretic:readConfigToml', filePath),
  writeConfigToml: (tomlContent, filePath) =>
    ipcRenderer.invoke('heretic:writeConfigToml', tomlContent, filePath),

  // Optuna Studies & Checkpoints
  listStudies: () => ipcRenderer.invoke('heretic:listStudies'),
  getStudy: (filename) => ipcRenderer.invoke('heretic:getStudy', filename),
  deleteStudy: (filename) => ipcRenderer.invoke('heretic:deleteStudy', filename),
  getAbliterationLayerProfile: (parameters, layerCount) =>
    ipcRenderer.invoke('heretic:getAbliterationLayerProfile', parameters, layerCount),
  generateModelCardPreview: (filename, trialIndex) =>
    ipcRenderer.invoke('heretic:generateModelCardPreview', filename, trialIndex),

  // Prompt & Keyword Marker Sandbox
  analyzeResponseText: (responseText, keywordMarkers) =>
    ipcRenderer.invoke('heretic:analyzeResponseText', responseText, keywordMarkers),

  // Plugin Studio
  listPlugins: () => ipcRenderer.invoke('heretic:listPlugins'),
  readPluginFile: (relativePath) => ipcRenderer.invoke('heretic:readPluginFile', relativePath),
  savePluginFile: (filename, content) =>
    ipcRenderer.invoke('heretic:savePluginFile', filename, content),

  // Grimoire & Reproducibility Vault
  listGrimoireManifests: () => ipcRenderer.invoke('heretic:listGrimoireManifests'),
  inspectGrimoireManifest: (filenameOrPath) =>
    ipcRenderer.invoke('heretic:inspectGrimoireManifest', filenameOrPath),

  // Process Runner & Guided Simulation
  startHereticProcess: (options) => ipcRenderer.invoke('heretic:startHereticProcess', options),
  stopHereticProcess: () => ipcRenderer.invoke('heretic:stopHereticProcess'),
  sendProcessInput: (input) => ipcRenderer.invoke('heretic:sendProcessInput', input),
  runEnvironmentSetup: (options) => ipcRenderer.invoke('heretic:runEnvironmentSetup', options),

  // Dialogs
  selectDirectoryDialog: () => ipcRenderer.invoke('heretic:selectDirectoryDialog'),
  selectFileDialog: (filters) => ipcRenderer.invoke('heretic:selectFileDialog', filters),

  // Event Subscriptions
  onProcessLog: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('heretic:processLog', listener);
    return () => ipcRenderer.removeListener('heretic:processLog', listener);
  },
  onProcessStateChange: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('heretic:processStateChange', listener);
    return () => ipcRenderer.removeListener('heretic:processStateChange', listener);
  },
  onStudyUpdated: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('heretic:studyUpdated', listener);
    return () => ipcRenderer.removeListener('heretic:studyUpdated', listener);
  },
});
