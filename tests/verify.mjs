import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { parse, stringify } from 'smol-toml';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_DIR = path.resolve(__dirname, '..');

const engine = require('../electron/hereticEngine.cjs');

async function runVerification() {
  console.log('=== Heretic Studio Verification Suite ===\n');

  // 1. Seed sample checkpoints, Grimoire manifests, and custom plugin
  engine.seedSampleCheckpointsAndGrimoire(WORKSPACE_DIR);

  const qwenCheckpoint = path.join(
    WORKSPACE_DIR,
    'checkpoints',
    'Qwen--Qwen3-4B-Instruct-2507.jsonl'
  );
  const llamaCheckpoint = path.join(
    WORKSPACE_DIR,
    'checkpoints',
    'meta-llama--Llama-3.2-3B-Instruct.jsonl'
  );

  assert.ok(fs.existsSync(qwenCheckpoint), 'Qwen ARA checkpoint should exist');
  assert.ok(fs.existsSync(llamaCheckpoint), 'Llama Abliteration checkpoint should exist');

  // 2. Test Optuna JournalStorage parser & Pareto Frontier calculation
  const qwenStudy = engine.parseOptunaJournal(qwenCheckpoint);
  assert.equal(qwenStudy.model, 'Qwen/Qwen3-4B-Instruct-2507');
  assert.equal(qwenStudy.modifierType, 'ARA');
  assert.equal(qwenStudy.totalTrials, 30);
  assert.ok(qwenStudy.paretoCount > 0 && qwenStudy.paretoCount < qwenStudy.totalTrials);
  console.log(
    `[PASS] Parsed Qwen ARA study: ${qwenStudy.totalTrials} trials, ${qwenStudy.paretoCount} Pareto-optimal trials`
  );

  const llamaStudy = engine.parseOptunaJournal(llamaCheckpoint);
  assert.equal(llamaStudy.modifierType, 'Abliteration');
  const layerProfile = engine.computeAbliterationLayerProfile(
    llamaStudy.paretoTrials[0].parameters,
    32
  );
  assert.ok(layerProfile && layerProfile.layers.length === 32);
  console.log(
    `[PASS] Computed MPOA / Abliteration 32-layer weight kernel for ${layerProfile.components.join(', ')}`
  );

  // 3. Test KeywordRate Marker Analyzer
  const refusalAnalysis = engine.analyzeResponseText(
    "I'm sorry, but as an AI assistant I cannot assist with that.",
    ['sorry', 'i cannot', 'as an ai']
  );
  assert.equal(refusalAnalysis.isMatch, true);
  assert.equal(refusalAnalysis.matchedMarkers.length, 3);

  const cleanAnalysis = engine.analyzeResponseText(
    'Here is the technical explanation of the shear line in a pin-tumbler lock.',
    ['sorry', 'i cannot', 'as an ai']
  );
  assert.equal(cleanAnalysis.isMatch, false);
  console.log('[PASS] Verified KeywordRate._is_match normalization & marker detection');

  // 4. Test all 7 official Heretic 2.x TOML presets
  const presetFiles = [
    'config.default.toml',
    'config.classifier.toml',
    'config.noslop.toml',
    'config.nosyco.toml',
    'config.nohumor.toml',
    'config.emotions.toml',
    'config.piqa.toml',
  ];
  for (const file of presetFiles) {
    const pPath = path.join(WORKSPACE_DIR, 'vendor', 'heretic', file);
    assert.ok(fs.existsSync(pPath), `Preset ${file} should exist`);
    const content = fs.readFileSync(pPath, 'utf-8');
    const parsed = parse(content);
    const serialized = stringify(parsed);
    assert.ok(serialized.length > 0);
  }
  console.log('[PASS] Parsed & round-tripped all 7 official Heretic 2.x TOML presets');

  // 5. Test Hardware Telemetry & Reproducibility Manifest Verification
  const telemetry = await engine.getHardwareTelemetry();
  const envStatus = await engine.getEnvironmentStatus(WORKSPACE_DIR);
  console.log(
    `[PASS] Hardware telemetry: Accelerator=${telemetry.accelerator.type || 'CPU'}, Total VRAM=${telemetry.accelerator.totalVramGb} GB`
  );

  const manifestPath = path.join(
    WORKSPACE_DIR,
    'grimoire',
    'Qwen3-4B-Instruct-2507-heretic-a91f3c2.json'
  );
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  const compat = engine.checkReproduceManifestCompatibility(
    manifest,
    telemetry,
    envStatus
  );
  assert.ok(['none', 'low', 'medium', 'high', 'critical'].includes(compat.maxSeverity));
  console.log(
    `[PASS] Verified Grimoire reproduce.json v4 environment checker (maxSeverity=${compat.maxSeverity})`
  );

  // 6. Test Hugging Face Model Card generator
  const card = engine.generateModelCardPreview(qwenStudy);
  assert.ok(card.includes('Arbitrary-Rank Ablation (ARA) parameters'));
  assert.ok(card.includes('Refusals'));
  console.log('[PASS] Generated Hugging Face Model Card README.md preview');

  console.log('\nAll verification checks passed!');
}

runVerification().catch((err) => {
  console.error(err);
  process.exit(1);
});
