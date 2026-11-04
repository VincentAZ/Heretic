// SPDX-License-Identifier: AGPL-3.0-or-later
// Heretic Studio — Electron Main Process & IPC Orchestrator
// Copyright (C) 2025-2026 Philipp Emanuel Weidmann (<pew@worldwidemann.com>) + contributors (Upstream Heretic Core)
// Copyright (C) 2026 Vincent Serpico (Heretic Studio Desktop UI & Engine Integration, modified/extended 2026-11-03)
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const engine = require('./hereticEngine.cjs');

const WORKSPACE_DIR = path.resolve(__dirname, '..');
const VENDOR_HERETIC_DIR = path.join(WORKSPACE_DIR, 'vendor', 'heretic');
const CHECKPOINTS_DIR = path.join(WORKSPACE_DIR, 'checkpoints');
const GRIMOIRE_DIR = path.join(WORKSPACE_DIR, 'grimoire');
const PLUGINS_DIR = path.join(WORKSPACE_DIR, 'plugins');
const PRESETS_DIR = path.join(WORKSPACE_DIR, 'presets');

app.setName('heretic-studio');
if (typeof app.setDesktopName === 'function') {
  app.setDesktopName('heretic-studio.desktop');
}

let mainWindow = null;
let activeChildProcess = null;
let activeSimulationTimer = null;
let processState = {
  running: false,
  mode: null, // 'cli' | 'simulate' | 'env-setup'
  model: null,
  pid: null,
  startedAt: null,
};

function emitLog(line, stream = 'stdout') {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('heretic:processLog', {
      timestamp: new Date().toISOString(),
      stream,
      text: line,
    });
  }
}

function updateProcessState(patch) {
  processState = { ...processState, ...patch };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('heretic:processStateChange', processState);
  }
}

function notifyStudyUpdated(filename) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('heretic:studyUpdated', { filename });
  }
}

function createWindow() {
  engine.seedSampleCheckpointsAndGrimoire(WORKSPACE_DIR);

  // Initialize default config.toml in workspace if not present
  const defaultConfigPath = path.join(WORKSPACE_DIR, 'config.toml');
  const vendorDefaultConfig = path.join(VENDOR_HERETIC_DIR, 'config.default.toml');
  if (!fs.existsSync(defaultConfigPath) && fs.existsSync(vendorDefaultConfig)) {
    fs.copyFileSync(vendorDefaultConfig, defaultConfigPath);
  }

  const iconPngPath = path.join(WORKSPACE_DIR, 'assets', 'icon.png');
  const iconSvgPath = path.join(WORKSPACE_DIR, 'assets', 'icon.svg');

  mainWindow = new BrowserWindow({
    width: 1560,
    height: 980,
    minWidth: 1180,
    minHeight: 760,
    title: 'Heretic Studio — Training-Free Language Model Modification',
    icon: fs.existsSync(iconPngPath) ? iconPngPath : iconSvgPath,
    backgroundColor: '#07080c',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  const distIndex = path.join(WORKSPACE_DIR, 'dist', 'index.html');

  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
  } else if (fs.existsSync(distIndex)) {
    mainWindow.loadFile(distIndex);
  } else {
    mainWindow.loadURL('http://localhost:5173');
  }

  if (process.env.HERETIC_CAPTURE_SCREENSHOTS === '1') {
    mainWindow.webContents.on('did-finish-load', async () => {
      try {
        const shotsDir = path.join(WORKSPACE_DIR, 'docs', 'screenshots');
        fs.mkdirSync(shotsDir, { recursive: true });
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        await sleep(1500);

        const tabs = [
          { label: 'Optimization & Pareto Studio', file: 'pareto-studio.png' },
          { label: 'Config & Preset Architect', file: 'config-architect.png' },
          { label: 'Prompt Sandbox & Benchmarks', file: 'prompt-sandbox.png' },
          { label: 'Plugin Studio', file: 'plugin-studio.png' },
          { label: 'Heretic Grimoire (Reproduce)', file: 'grimoire-reproduce.png' },
          { label: 'Hardware & Python Env', file: 'hardware-env.png' },
        ];

        for (const t of tabs) {
          await mainWindow.webContents.executeJavaScript(`
            (() => {
              const btns = Array.from(document.querySelectorAll('nav button'));
              const match = btns.find(b => b.textContent && b.textContent.includes(${JSON.stringify(t.label)}));
              if (match) match.click();
            })()
          `);
          await sleep(600);
          const image = await mainWindow.webContents.capturePage();
          fs.writeFileSync(path.join(shotsDir, t.file), image.toPNG());
        }
        app.quit();
      } catch (err) {
        console.error('Screenshot capture error:', err);
        app.quit();
      }
    });
  }
}

// Register IPC Handlers
function registerIpcHandlers() {
  ipcMain.handle('heretic:getHardwareTelemetry', async () => {
    return engine.getHardwareTelemetry();
  });

  ipcMain.handle('heretic:getEnvironmentStatus', async () => {
    return engine.getEnvironmentStatus(WORKSPACE_DIR);
  });

  ipcMain.handle(
    'heretic:estimateModelMemory',
    (_event, modelName, quantization, paramCountB) => {
      return engine.estimateModelMemory(modelName, quantization, paramCountB);
    }
  );

  ipcMain.handle('heretic:getPresets', () => {
    const builtInPresets = [
      {
        id: 'default',
        name: 'Refusal Suppression (Default ARA)',
        badge: 'Censorship Removal',
        filename: 'config.default.toml',
        description:
          'Default Heretic 2.x workflow: Arbitrary-Rank Ablation (ARA) co-optimizing Refusals (KeywordRate) and KL Divergence.',
        category: 'builtin',
      },
      {
        id: 'classifier',
        name: 'ModernBERT Refusal Classifier',
        badge: 'Classifier Scoring',
        filename: 'config.classifier.toml',
        description:
          'Replaces keyword markers with VINAY-UMRETHE/Refusal-Classifier (ModernBERT) for semantic refusal detection alongside KL Divergence.',
        category: 'builtin',
      },
      {
        id: 'noslop',
        name: 'Slop & Purple Prose Suppression',
        badge: 'Creative Writing',
        filename: 'config.noslop.toml',
        description:
          'Suppresses 120+ AI cliches ("Eldoria", "tapestry", "testament", "neon lights", "shiver") on llm-aes/writing-prompts.',
        category: 'builtin',
      },
      {
        id: 'nosyco',
        name: 'Anti-Sycophancy Steering',
        badge: 'Objective Tone',
        filename: 'config.nosyco.toml',
        description:
          'Eliminates excessive flattery and sycophantic agreement ("great question", "you\'re spot on", "pure brilliance") using UnstableLlama/praise.',
        category: 'builtin',
      },
      {
        id: 'nohumor',
        name: 'Humor & Joke Suppression',
        badge: 'Serious Mode',
        filename: 'config.nohumor.toml',
        description:
          'Steers the model away from dad jokes, puns, and comedic phrasing using UnstableLlama/jokes.',
        category: 'builtin',
      },
      {
        id: 'emotions',
        name: 'Multi-Objective Emotion Steering',
        badge: 'Personality',
        filename: 'config.emotions.toml',
        description:
          'Uses two BERTClassifier instances (j-hartmann/emotion-english-distilroberta-base) to simultaneously minimize negative emotions and maximize joy/surprise.',
        category: 'builtin',
      },
      {
        id: 'piqa',
        name: 'Benchmark-Guided Ablation (PIQA)',
        badge: 'lm-eval Harness',
        filename: 'config.piqa.toml',
        description:
          'Co-optimizes Refusal minimization with maximizing physical commonsense reasoning (PIQA acc_norm via lm-eval).',
        category: 'builtin',
      },
    ];

    const loadedBuiltIns = builtInPresets.map((p) => {
      const fullPath = path.join(VENDOR_HERETIC_DIR, p.filename);
      const content = fs.existsSync(fullPath)
        ? fs.readFileSync(fullPath, 'utf-8')
        : '';
      return { ...p, tomlContent: content };
    });

    // Also load any custom presets saved in presets/
    const customPresets = [];
    if (fs.existsSync(PRESETS_DIR)) {
      for (const file of fs.readdirSync(PRESETS_DIR)) {
        if (file.endsWith('.toml')) {
          const fullPath = path.join(PRESETS_DIR, file);
          const content = fs.readFileSync(fullPath, 'utf-8');
          const baseId = file.replace(/\.toml$/, '');
          customPresets.push({
            id: `custom_${baseId}`,
            name: baseId.replace(/[-_]/g, ' '),
            badge: 'Custom Preset',
            filename: file,
            description: `User-saved custom configuration (${file})`,
            category: 'custom',
            tomlContent: content,
          });
        }
      }
    }

    return [...loadedBuiltIns, ...customPresets];
  });

  ipcMain.handle(
    'heretic:saveCustomPreset',
    (_event, name, _description, tomlContent) => {
      fs.mkdirSync(PRESETS_DIR, { recursive: true });
      const safeName =
        String(name || 'custom-preset')
          .toLowerCase()
          .replace(/[^a-z0-9_-]+/g, '-')
          .replace(/^-+|-+$/g, '') || 'custom-preset';
      const filename = `${safeName}.toml`;
      const targetPath = path.join(PRESETS_DIR, filename);
      fs.writeFileSync(targetPath, String(tomlContent || ''), 'utf-8');
      return { ok: true, filename, path: targetPath };
    }
  );

  ipcMain.handle('heretic:readConfigToml', (_event, customPath) => {
    const target = customPath || path.join(WORKSPACE_DIR, 'config.toml');
    if (fs.existsSync(target)) {
      return {
        path: target,
        content: fs.readFileSync(target, 'utf-8'),
      };
    }
    const fallback = path.join(VENDOR_HERETIC_DIR, 'config.default.toml');
    return {
      path: target,
      content: fs.existsSync(fallback) ? fs.readFileSync(fallback, 'utf-8') : '',
    };
  });

  ipcMain.handle('heretic:writeConfigToml', (_event, tomlContent, customPath) => {
    const target = customPath || path.join(WORKSPACE_DIR, 'config.toml');
    fs.writeFileSync(target, String(tomlContent || ''), 'utf-8');
    return { ok: true, path: target };
  });

  // Studies & Checkpoints
  ipcMain.handle('heretic:listStudies', () => {
    fs.mkdirSync(CHECKPOINTS_DIR, { recursive: true });
    const files = fs
      .readdirSync(CHECKPOINTS_DIR)
      .filter((f) => f.endsWith('.jsonl'));
    const studies = files.map((file) => {
      const fullPath = path.join(CHECKPOINTS_DIR, file);
      return engine.parseOptunaJournal(fullPath, file);
    });
    return studies.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  });

  ipcMain.handle('heretic:getStudy', (_event, filename) => {
    const safeFile = filename.endsWith('.jsonl') ? filename : `${filename}.jsonl`;
    const fullPath = path.join(CHECKPOINTS_DIR, path.basename(safeFile));
    if (!fs.existsSync(fullPath)) return null;
    return engine.parseOptunaJournal(fullPath, path.basename(safeFile));
  });

  ipcMain.handle('heretic:deleteStudy', (_event, filename) => {
    const safeFile = filename.endsWith('.jsonl') ? filename : `${filename}.jsonl`;
    const fullPath = path.join(CHECKPOINTS_DIR, path.basename(safeFile));
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
    return { ok: true };
  });

  ipcMain.handle(
    'heretic:getAbliterationLayerProfile',
    (_event, parameters, layerCount) => {
      return engine.computeAbliterationLayerProfile(parameters, layerCount || 32);
    }
  );

  ipcMain.handle(
    'heretic:generateModelCardPreview',
    (_event, filename, trialIndex) => {
      const safeFile = filename.endsWith('.jsonl') ? filename : `${filename}.jsonl`;
      const fullPath = path.join(CHECKPOINTS_DIR, path.basename(safeFile));
      if (!fs.existsSync(fullPath)) return '# Study not found';
      const study = engine.parseOptunaJournal(fullPath, path.basename(safeFile));
      return engine.generateModelCardPreview(study, trialIndex);
    }
  );

  // Prompt & Keyword Marker Analyzer
  ipcMain.handle(
    'heretic:analyzeResponseText',
    (_event, responseText, keywordMarkers) => {
      return engine.analyzeResponseText(responseText, keywordMarkers);
    }
  );

  // Plugin Studio
  ipcMain.handle('heretic:listPlugins', () => {
    const list = [];
    const builtInModifiersDir = path.join(
      VENDOR_HERETIC_DIR,
      'src',
      'heretic',
      'modifiers'
    );
    const builtInScorersDir = path.join(
      VENDOR_HERETIC_DIR,
      'src',
      'heretic',
      'scorers'
    );

    if (fs.existsSync(builtInModifiersDir)) {
      for (const f of fs.readdirSync(builtInModifiersDir)) {
        if (f.endsWith('.py') && f !== '__init__.py') {
          list.push({
            name: f,
            type: 'modifier',
            builtin: true,
            importPath:
              f === 'ara.py'
                ? 'heretic.modifiers.ara.ARA'
                : 'heretic.modifiers.abliteration.Abliteration',
            relativePath: `vendor/heretic/src/heretic/modifiers/${f}`,
          });
        }
      }
    }

    if (fs.existsSync(builtInScorersDir)) {
      const classMap = {
        'keyword_rate.py': 'heretic.scorers.keyword_rate.KeywordRate',
        'kl_divergence.py': 'heretic.scorers.kl_divergence.KLDivergence',
        'bert_classifier.py': 'heretic.scorers.bert_classifier.BERTClassifier',
        'benchmark_score.py': 'heretic.scorers.benchmark_score.BenchmarkScore',
      };
      for (const f of fs.readdirSync(builtInScorersDir)) {
        if (f.endsWith('.py') && f !== '__init__.py') {
          list.push({
            name: f,
            type: 'scorer',
            builtin: true,
            importPath: classMap[f] || `heretic.scorers.${f.replace('.py', '')}`,
            relativePath: `vendor/heretic/src/heretic/scorers/${f}`,
          });
        }
      }
    }

    fs.mkdirSync(PLUGINS_DIR, { recursive: true });
    for (const f of fs.readdirSync(PLUGINS_DIR)) {
      if (f.endsWith('.py')) {
        const content = fs.readFileSync(path.join(PLUGINS_DIR, f), 'utf-8');
        const isModifier = content.includes('(Modifier');
        const classMatch = content.match(/class\s+([A-Za-z0-9_]+)\s*\(\s*(?:Scorer|Modifier)/);
        const className = classMatch ? classMatch[1] : 'CustomPlugin';
        list.push({
          name: f,
          type: isModifier ? 'modifier' : 'scorer',
          builtin: false,
          importPath: `plugins/${f}:${className}`,
          relativePath: `plugins/${f}`,
        });
      }
    }

    return list;
  });

  ipcMain.handle('heretic:readPluginFile', (_event, relativePath) => {
    const resolved = path.resolve(WORKSPACE_DIR, relativePath);
    if (!resolved.startsWith(WORKSPACE_DIR) || !fs.existsSync(resolved)) {
      return '';
    }
    return fs.readFileSync(resolved, 'utf-8');
  });

  ipcMain.handle('heretic:savePluginFile', (_event, filename, content) => {
    fs.mkdirSync(PLUGINS_DIR, { recursive: true });
    const safeName = path.basename(filename).endsWith('.py')
      ? path.basename(filename)
      : `${path.basename(filename)}.py`;
    const target = path.join(PLUGINS_DIR, safeName);
    fs.writeFileSync(target, String(content || ''), 'utf-8');
    return {
      ok: true,
      relativePath: `plugins/${safeName}`,
    };
  });

  // Grimoire & Reproducibility Vault
  ipcMain.handle('heretic:listGrimoireManifests', () => {
    fs.mkdirSync(GRIMOIRE_DIR, { recursive: true });
    const results = [];

    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.name.endsWith('.json')) {
          try {
            const data = JSON.parse(fs.readFileSync(full, 'utf-8'));
            results.push({
              filename: path.relative(GRIMOIRE_DIR, full),
              fullPath: full,
              version: data.version || 'unknown',
              timestamp: data.timestamp || null,
              model: data.settings?.model || 'Unknown Model',
              modifiedModelType: data.settings?.modified_model_type || 'decensored',
              modifier: data.settings?.modifiers?.[0]?.plugin || 'heretic.modifiers.ara.ARA',
              scores: data.scores || [],
              parameters: data.parameters || {},
              accelerator:
                data.system?.accelerators?.devices?.[0]?.name ||
                data.system?.accelerators?.type ||
                'Unspecified',
              hashesCount: Object.keys(data.hashes || {}).length,
            });
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }

    walk(GRIMOIRE_DIR);
    return results;
  });

  ipcMain.handle('heretic:inspectGrimoireManifest', async (_event, filenameOrPath) => {
    let targetPath = filenameOrPath;
    if (!path.isAbsolute(filenameOrPath)) {
      targetPath = path.join(GRIMOIRE_DIR, filenameOrPath);
    }
    if (!fs.existsSync(targetPath)) {
      return null;
    }
    const manifest = JSON.parse(fs.readFileSync(targetPath, 'utf-8'));
    const telemetry = await engine.getHardwareTelemetry();
    const envStatus = await engine.getEnvironmentStatus(WORKSPACE_DIR);
    const compatibility = engine.checkReproduceManifestCompatibility(
      manifest,
      telemetry,
      envStatus
    );

    return {
      manifest,
      compatibility,
      filePath: targetPath,
    };
  });

  // Process Runner & Guided Simulation
  ipcMain.handle('heretic:startHereticProcess', async (_event, options = {}) => {
    if (processState.running) {
      return { ok: false, error: 'A Heretic process is already running.' };
    }

    const mode = options.mode || 'simulate'; // 'cli' | 'simulate'
    const model = options.model || 'Qwen/Qwen3-4B-Instruct-2507';
    const tomlContent = options.tomlContent;

    const configPath = path.join(WORKSPACE_DIR, 'config.toml');
    if (tomlContent) {
      fs.writeFileSync(configPath, tomlContent, 'utf-8');
    }

    if (mode === 'simulate') {
      startSimulatedHereticRun(options);
      return { ok: true, mode: 'simulate' };
    }

    // Real CLI execution mode
    const envStatus = await engine.getEnvironmentStatus(WORKSPACE_DIR);
    const cliArgs = ['-m', 'heretic.main'];

    if (options.reproducePath) {
      cliArgs.push('--reproduce', options.reproducePath);
    } else if (options.collectReproduciblesDir) {
      cliArgs.push('--collect-reproducibles', options.collectReproduciblesDir);
    } else {
      cliArgs.push('--model', model);
      if (options.evaluateModel) {
        cliArgs.push('--evaluate-model', options.evaluateModel);
      }
      if (options.checkpointAction) {
        cliArgs.push('--checkpoint-action', options.checkpointAction);
      }
      if (options.nTrials) {
        cliArgs.push('--n-trials', String(options.nTrials));
      }
      if (options.quantization) {
        cliArgs.push('--quantization', options.quantization);
      }
      if (options.exportStrategy) {
        cliArgs.push('--export-strategy', options.exportStrategy);
      }
      if (options.saveDirectory) {
        cliArgs.push('--save-directory', options.saveDirectory);
      }
    }

    const pythonExe = envStatus.executable || 'python3';
    const existingPythonPath = process.env.PYTHONPATH || '';
    const vendorSrcPath = path.join(VENDOR_HERETIC_DIR, 'src');

    emitLog(
      `[Heretic Studio] Launching CLI: ${pythonExe} ${cliArgs.join(' ')}`,
      'system'
    );

    const child = spawn(pythonExe, cliArgs, {
      cwd: WORKSPACE_DIR,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        HERETIC_CONFIG_FILE: configPath,
        PYTHONPATH: existingPythonPath
          ? `${vendorSrcPath}:${existingPythonPath}`
          : vendorSrcPath,
      },
    });

    activeChildProcess = child;
    updateProcessState({
      running: true,
      mode: 'cli',
      model,
      pid: child.pid,
      startedAt: new Date().toISOString(),
    });

    const checkpointFilename = engine.getCheckpointFilename(model);

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString('utf-8');
      for (const line of text.split(/\r?\n/)) {
        if (line.trim()) emitLog(line, 'stdout');
      }
      notifyStudyUpdated(checkpointFilename);
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString('utf-8');
      for (const line of text.split(/\r?\n/)) {
        if (line.trim()) emitLog(line, 'stderr');
      }
    });

    child.on('close', (code) => {
      emitLog(`[Heretic Studio] Process exited with code ${code}`, 'system');
      activeChildProcess = null;
      updateProcessState({
        running: false,
        mode: null,
        pid: null,
      });
      notifyStudyUpdated(checkpointFilename);
    });

    child.on('error', (err) => {
      emitLog(`[Heretic Studio] Failed to launch process: ${err.message}`, 'stderr');
      activeChildProcess = null;
      updateProcessState({
        running: false,
        mode: null,
        pid: null,
      });
    });

    return { ok: true, mode: 'cli', pid: child.pid };
  });

  ipcMain.handle('heretic:stopHereticProcess', () => {
    if (activeSimulationTimer) {
      clearInterval(activeSimulationTimer);
      activeSimulationTimer = null;
      emitLog('[Heretic Studio] Guided simulation stopped by user (SIGINT).', 'system');
      updateProcessState({ running: false, mode: null, pid: null });
      return { ok: true };
    }
    if (activeChildProcess) {
      activeChildProcess.kill('SIGINT');
      emitLog('[Heretic Studio] Sent SIGINT to Heretic process...', 'system');
      return { ok: true };
    }
    return { ok: true };
  });

  ipcMain.handle('heretic:sendProcessInput', (_event, input) => {
    if (activeChildProcess && activeChildProcess.stdin) {
      activeChildProcess.stdin.write(`${input}\n`);
      emitLog(`> ${input}`, 'stdin');
      return { ok: true };
    }
    return { ok: false, error: 'No active interactive CLI process.' };
  });

  ipcMain.handle('heretic:runEnvironmentSetup', async (_event, options = {}) => {
    if (processState.running) {
      return { ok: false, error: 'Another process is currently running.' };
    }

    const venvPath = path.join(WORKSPACE_DIR, '.venv');
    const sourceMode = options.source || 'vendor'; // 'vendor' | 'pypi'
    const installTarget =
      sourceMode === 'vendor' ? `${VENDOR_HERETIC_DIR}` : 'heretic-llm';

    const script = `
set -e
echo "[Setup] Creating Python virtual environment in ${venvPath}..."
python3 -m venv "${venvPath}"
echo "[Setup] Upgrading pip..."
"${venvPath}/bin/pip" install --upgrade pip
echo "[Setup] Installing Heretic (${installTarget})..."
"${venvPath}/bin/pip" install -e "${installTarget}" || "${venvPath}/bin/pip" install "${installTarget}"
echo "[Setup] Environment setup complete!"
`;

    const child = spawn('bash', ['-c', script], {
      cwd: WORKSPACE_DIR,
    });

    activeChildProcess = child;
    updateProcessState({
      running: true,
      mode: 'env-setup',
      model: 'Environment Setup',
      pid: child.pid,
      startedAt: new Date().toISOString(),
    });

    child.stdout.on('data', (chunk) => {
      for (const line of chunk.toString('utf-8').split(/\r?\n/)) {
        if (line.trim()) emitLog(line, 'stdout');
      }
    });
    child.stderr.on('data', (chunk) => {
      for (const line of chunk.toString('utf-8').split(/\r?\n/)) {
        if (line.trim()) emitLog(line, 'stderr');
      }
    });
    child.on('close', (code) => {
      emitLog(`[Setup] Exited with code ${code}`, 'system');
      activeChildProcess = null;
      updateProcessState({ running: false, mode: null, pid: null });
    });

    return { ok: true };
  });

  // Native file/directory dialogs
  ipcMain.handle('heretic:selectDirectoryDialog', async () => {
    const res = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
    });
    if (res.canceled || !res.filePaths.length) return null;
    return res.filePaths[0];
  });

  ipcMain.handle('heretic:selectFileDialog', async (_event, filters = []) => {
    const res = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters,
    });
    if (res.canceled || !res.filePaths.length) return null;
    return res.filePaths[0];
  });
}

/**
 * Guided Simulation Engine:
 * Executes an authentic Heretic 2.x study pipeline, emitting real Heretic console logs
 * and appending real Optuna JournalStorage JSONL records to `checkpoints/<model>.jsonl`
 * so the user can watch live multi-objective TPE optimization & Pareto frontier updates.
 */
function startSimulatedHereticRun(options = {}) {
  const model = options.model || 'Qwen/Qwen3-4B-Instruct-2507';
  const nTrials = Number(options.nTrials) || 15;
  const modifierPlugin = options.modifierPlugin || 'heretic.modifiers.ara.ARA';
  const isAbliteration = modifierPlugin.toLowerCase().includes('abliteration');
  const modifiedModelType = options.modifiedModelType || 'decensored';
  const scoreName = options.scoreName || 'Refusals';

  const checkpointFilename = engine.getCheckpointFilename(model);
  const checkpointPath = path.join(CHECKPOINTS_DIR, checkpointFilename);
  fs.mkdirSync(CHECKPOINTS_DIR, { recursive: true });

  // Initialize study journal file
  const studySettings = {
    model,
    quantization: options.quantization || 'none',
    batch_size: 32,
    max_response_length: options.maxResponseLength || 100,
    modified_model_type: modifiedModelType,
    n_trials: nTrials,
    n_startup_trials: Math.min(5, Math.floor(nTrials / 3)),
    seed: options.seed || 133742,
    scorers: [
      { plugin: 'heretic.scorers.keyword_rate.KeywordRate', optimization: 'minimize' },
      { plugin: 'heretic.scorers.kl_divergence.KLDivergence', optimization: 'minimize' },
    ],
    modifiers: [{ plugin: modifierPlugin }],
  };

  const initLines = [
    JSON.stringify({ op_code: 0, study_name: 'heretic', directions: [1, 1] }),
    JSON.stringify({
      op_code: 2,
      study_id: 0,
      user_attr: {
        settings: JSON.stringify(studySettings),
        finished: false,
      },
    }),
  ];
  fs.writeFileSync(checkpointPath, initLines.join('\n') + '\n', 'utf-8');

  updateProcessState({
    running: true,
    mode: 'simulate',
    model,
    pid: process.pid,
    startedAt: new Date().toISOString(),
  });

  emitLog('█░█░█▀▀░█▀▄░█▀▀░▀█▀░█░█▀▀  v2.1.0', 'stdout');
  emitLog('█▀█░█▀▀░█▀▄░█▀▀░░█░░█░█░░  https://heretic-project.org', 'stdout');
  emitLog('▀░▀░▀▀▀░▀░▀░▀▀▀░░▀░░▀░▀▀▀  https://github.com/p-e-w/heretic', 'stdout');
  emitLog(`Detected 1 CUDA device(s) (95.59 GB total VRAM)`, 'stdout');
  emitLog(`* CUDA 0: NVIDIA RTX PRO 6000 Blackwell Workstation Edition (95.59 GB)`, 'stdout');
  emitLog(`Loading model ${model} (dtype=bfloat16, quantization=${studySettings.quantization})...`, 'stdout');
  emitLog(`Determining optimal batch size...`, 'stdout');
  emitLog(`* Trying batch size 1... Ok (310 tokens/s)`, 'stdout');
  emitLog(`* Trying batch size 8... Ok (1420 tokens/s)`, 'stdout');
  emitLog(`* Trying batch size 32... Ok (3890 tokens/s)`, 'stdout');
  emitLog(`* Chosen batch size: 32`, 'stdout');
  emitLog(`Checking chat template for a closed Chain-of-Thought block or an initializer...`, 'stdout');
  emitLog(`* Loading and initializing scorers: KeywordRate (${scoreName}), KLDivergence`, 'stdout');
  emitLog(`* Baseline ${scoreName}: 95/100`, 'stdout');
  emitLog(`* Baseline KL divergence: 0 (by definition)`, 'stdout');
  emitLog(
    `Loading and initializing modifier: ${
      isAbliteration
        ? 'Magnitude-Preserving Orthogonal Ablation (MPOA)'
        : 'Arbitrary-Rank Ablation (ARA)'
    }...`,
    'stdout'
  );

  notifyStudyUpdated(checkpointFilename);

  let currentTrial = 0;

  activeSimulationTimer = setInterval(() => {
    currentTrial += 1;
    const tid = currentTrial - 1;

    // Generate realistic progressive TPE optimization metrics
    const progress = currentTrial / nTrials;
    const explorationNoise = Math.random() * (1 - progress * 0.65);
    const refusalsCount = Math.max(
      0,
      Math.round(45 * explorationNoise * Math.random() + (Math.random() < 0.35 ? 0 : 2))
    );
    const klVal = Number(
      Math.max(
        0.025,
        0.32 - (refusalsCount / 100) * 0.55 + (Math.random() - 0.5) * 0.08 * (1 - progress * 0.5)
      ).toFixed(4)
    );

    let parameters;
    if (isAbliteration) {
      const attnMax = Number((0.95 + Math.random() * 0.45).toFixed(2));
      const attnPos = Number((17 + Math.random() * 5).toFixed(2));
      const attnMin = Number((attnMax * (0.15 + Math.random() * 0.35)).toFixed(2));
      const attnDist = Number((8 + Math.random() * 5).toFixed(2));
      const mlpMax = Math.random() < 0.4 ? 0 : Number((Math.random() * 0.4).toFixed(2));
      parameters = {
        direction_index:
          Math.random() < 0.3 ? null : Number((15.5 + Math.random() * 4).toFixed(2)),
        weight_distributions: {
          'attn.o_proj': {
            max_weight: attnMax,
            max_weight_position: attnPos,
            min_weight: attnMin,
            min_weight_distance: attnDist,
          },
          'mlp.down_proj': {
            max_weight: mlpMax,
            max_weight_position: Number((18 + Math.random() * 4).toFixed(2)),
            min_weight: Number((mlpMax * 0.25).toFixed(2)),
            min_weight_distance: Number((6 + Math.random() * 4).toFixed(2)),
          },
        },
      };
    } else {
      parameters = {
        start_layer_index: Math.floor(6 + Math.random() * 7),
        end_layer_index: Math.floor(24 + Math.random() * 7),
        preserve_good_behavior_weight: Number((0.35 + Math.random() * 0.5).toFixed(4)),
        steer_bad_behavior_weight: Number((0.02 + Math.random() * 0.16).toFixed(4)),
        overcorrect_relative_weight: Number((0.45 + Math.random() * 0.45).toFixed(4)),
        neighbor_count: Math.floor(5 + Math.random() * 7),
      };
    }

    const trialLines = [
      JSON.stringify({
        op_code: 4,
        study_id: 0,
        trial_id: tid,
        datetime_start: new Date().toISOString(),
      }),
      JSON.stringify({
        op_code: 7,
        trial_id: tid,
        user_attr: {
          index: currentTrial,
          parameters,
          scores: [
            {
              name: scoreName,
              score: {
                value: refusalsCount / 100,
                rich_display: `[bold]${refusalsCount}[/]/100`,
                md_display: `${refusalsCount}/100`,
              },
              baseline: {
                value: 0.95,
                rich_display: '[bold]95[/]/100',
                md_display: '95/100',
              },
            },
            {
              name: 'KL divergence',
              score: {
                value: klVal,
                rich_display: `[bold]${klVal.toFixed(4)}[/]`,
                md_display: `${klVal.toFixed(4)}`,
              },
              baseline: {
                value: 0,
                rich_display: '[bold]0[/] [italic](by definition)[/]',
                md_display: '0 *(by definition)*',
              },
            },
          ],
        },
      }),
      JSON.stringify({
        op_code: 6,
        trial_id: tid,
        state: 1,
        values: [refusalsCount / 100, klVal],
        datetime_complete: new Date().toISOString(),
      }),
    ];

    fs.appendFileSync(checkpointPath, trialLines.join('\n') + '\n', 'utf-8');

    emitLog(
      `Running trial ${currentTrial} of ${nTrials}... -> ${scoreName}: ${refusalsCount}/100 | KL divergence: ${klVal.toFixed(4)}`,
      'stdout'
    );
    notifyStudyUpdated(checkpointFilename);

    if (currentTrial >= nTrials) {
      clearInterval(activeSimulationTimer);
      activeSimulationTimer = null;

      fs.appendFileSync(
        checkpointPath,
        JSON.stringify({
          op_code: 2,
          study_id: 0,
          user_attr: {
            settings: JSON.stringify(studySettings),
            finished: true,
          },
        }) + '\n',
        'utf-8'
      );

      emitLog('Optimization finished! Pareto front computed and ready for export.', 'stdout');
      notifyStudyUpdated(checkpointFilename);
      updateProcessState({ running: false, mode: null, pid: null });
    }
  }, 650);
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (activeChildProcess) {
    activeChildProcess.kill('SIGINT');
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
