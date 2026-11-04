export interface DatasetSpec {
  dataset: string;
  commit?: string;
  config?: string;
  split?: string;
  column?: string;
  prefix?: string;
  suffix?: string;
  system_prompt?: string;
}

export interface ScorerEntryConfig {
  plugin: string;
  optimization: 'minimize' | 'maximize' | 'none';
  instance_name?: string;
}

export interface ModifierEntryConfig {
  plugin: string;
  instance_name?: string;
}

export interface HereticConfig {
  model: string;
  model_commit?: string;
  quantization: 'none' | 'bnb_4bit';
  dtypes: string[];
  device_map: string | Record<string, string | number>;
  max_memory?: Record<string, string>;
  offload_outputs_to_cpu: boolean;
  batch_size: number;
  max_batch_size: number;
  max_response_length: number;
  response_prefix?: string;
  chain_of_thought_blocks: [string, string][];
  print_debug_information: boolean;
  scorers: ScorerEntryConfig[];
  modifiers: ModifierEntryConfig[];
  n_trials: number;
  n_startup_trials: number;
  seed?: number;
  study_checkpoint_dir: string;
  modified_model_type: string;
  max_shard_size: string | number;
  upload_tags: string[];
  system_prompt: string;
  export_strategy?: 'merge' | 'adapter';
  checkpoint_action?: 'continue' | 'restart';
  trial_index?: number;
  model_action?: 'save' | 'upload';
  save_directory?: string;
  upload_repo_id?: string;
  upload_repo_private?: boolean;
  upload_reproducibility_information?: 'full' | 'basic' | 'none';
  batch_size_test_prompts?: DatasetSpec;
  response_prefix_test_prompts?: DatasetSpec[];
  scorer?: Record<string, any>;
  modifier?: Record<string, any>;
  [key: string]: any;
}

export interface ScoreDisplay {
  value: number;
  rich_display: string;
  md_display: string;
}

export interface TrialScoreRecord {
  name: string;
  score: ScoreDisplay;
  baseline: ScoreDisplay;
}

export interface OptunaTrial {
  trialId: number;
  index: number;
  state: number;
  stateName: 'RUNNING' | 'COMPLETE' | 'PRUNED' | 'FAIL';
  datetimeStart: string | null;
  datetimeComplete: string | null;
  values: number[];
  sampledParams: Record<string, number>;
  parameters: Record<string, any>;
  scores: TrialScoreRecord[];
  isParetoOptimal: boolean;
}

export interface OptunaStudy {
  id: string;
  filename: string;
  filePath: string | null;
  updatedAt: string;
  studyName: string;
  finished: boolean;
  directions: ('minimize' | 'maximize')[];
  settings: Partial<HereticConfig>;
  model: string;
  modifiedModelType: string;
  modifierPlugin: string;
  modifierType: 'ARA' | 'Abliteration';
  nTrialsTarget: number;
  totalTrials: number;
  completedTrialsCount: number;
  paretoCount: number;
  scoreMetrics: {
    name: string;
    baseline: ScoreDisplay;
    direction: 'minimize' | 'maximize';
  }[];
  trials: OptunaTrial[];
  paretoTrials: OptunaTrial[];
}

export interface AbliterationLayerProfile {
  directionIndex: number | null;
  components: string[];
  layers: ({
    layerIndex: number;
    [component: string]: number;
  })[];
}

export interface GpuDeviceTelemetry {
  index: number;
  name: string;
  vramTotalGb: number;
  vramUsedGb: number;
  vramFreeGb: number;
  utilizationPercent: number;
  temperatureC: number;
  powerDrawW: number;
  driverVersion: string;
}

export interface HardwareTelemetry {
  timestamp: string;
  system: {
    platform: string;
    hostname: string;
    cpuBrand: string;
    cpuCores: number;
    ramTotalGb: number;
    ramUsedGb: number;
    ramFreeGb: number;
    ramPercent: number;
  };
  accelerator: {
    type: string | null;
    driverVersion: string | null;
    cudaVersion?: string | null;
    devices: GpuDeviceTelemetry[];
    totalVramGb: number;
    usedVramGb: number;
  };
}

export interface EnvironmentStatus {
  pythonVersion: string | null;
  executable: string;
  hereticInstalled: boolean;
  vendorHereticAvailable: boolean;
  packages: Record<string, string | null>;
}

export interface MemoryEstimate {
  estimatedParamsB: number;
  quantization: string;
  bf16WeightsGb: number;
  bnb4bitWeightsGb: number;
  estimatedPeakVramGb: number;
  estimatedCpuMergeRamGb: number;
  requiresCpuDequantMergeWarning: boolean;
}

export interface PresetItem {
  id: string;
  name: string;
  badge: string;
  filename: string;
  description: string;
  category: 'builtin' | 'custom';
  tomlContent: string;
}

export interface PluginItem {
  name: string;
  type: 'modifier' | 'scorer';
  builtin: boolean;
  importPath: string;
  relativePath: string;
}

export interface GrimoireManifestSummary {
  filename: string;
  fullPath: string;
  version: string;
  timestamp: string | null;
  model: string;
  modifiedModelType: string;
  modifier: string;
  scores: TrialScoreRecord[];
  parameters: Record<string, any>;
  accelerator: string;
  hashesCount: number;
}

export interface MismatchItem {
  component: string;
  thisSystem: string;
  originalSystem: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface GrimoireInspection {
  manifest: Record<string, any>;
  compatibility: {
    compatible: boolean;
    maxSeverity: 'none' | 'low' | 'medium' | 'high' | 'critical';
    systemMismatches: MismatchItem[];
    packageMismatches: MismatchItem[];
  };
  filePath: string;
}

export interface ProcessState {
  running: boolean;
  mode: 'cli' | 'simulate' | 'env-setup' | null;
  model: string | null;
  pid: number | null;
  startedAt: string | null;
}

export interface ProcessLogEntry {
  timestamp: string;
  stream: 'stdout' | 'stderr' | 'stdin' | 'system';
  text: string;
}

declare global {
  interface Window {
    hereticAPI?: {
      getHardwareTelemetry: () => Promise<HardwareTelemetry>;
      getEnvironmentStatus: () => Promise<EnvironmentStatus>;
      estimateModelMemory: (
        modelName: string,
        quantization?: string,
        paramCountB?: number
      ) => Promise<MemoryEstimate>;
      getPresets: () => Promise<PresetItem[]>;
      saveCustomPreset: (
        name: string,
        description: string,
        tomlContent: string
      ) => Promise<{ ok: boolean; filename: string; path: string }>;
      readConfigToml: (
        filePath?: string
      ) => Promise<{ path: string; content: string }>;
      writeConfigToml: (
        tomlContent: string,
        filePath?: string
      ) => Promise<{ ok: boolean; path: string }>;
      listStudies: () => Promise<OptunaStudy[]>;
      getStudy: (filename: string) => Promise<OptunaStudy | null>;
      deleteStudy: (filename: string) => Promise<{ ok: boolean }>;
      getAbliterationLayerProfile: (
        parameters: Record<string, any>,
        layerCount?: number
      ) => Promise<AbliterationLayerProfile | null>;
      generateModelCardPreview: (
        filename: string,
        trialIndex?: number | null
      ) => Promise<string>;
      analyzeResponseText: (
        responseText: string,
        keywordMarkers: string[]
      ) => Promise<{
        isMatch: boolean;
        isEmpty: boolean;
        matchedMarkers: string[];
        normalizedText: string;
      }>;
      listPlugins: () => Promise<PluginItem[]>;
      readPluginFile: (relativePath: string) => Promise<string>;
      savePluginFile: (
        filename: string,
        content: string
      ) => Promise<{ ok: boolean; relativePath: string }>;
      listGrimoireManifests: () => Promise<GrimoireManifestSummary[]>;
      inspectGrimoireManifest: (
        filenameOrPath: string
      ) => Promise<GrimoireInspection | null>;
      startHereticProcess: (options: Record<string, any>) => Promise<{
        ok: boolean;
        mode?: string;
        pid?: number;
        error?: string;
      }>;
      stopHereticProcess: () => Promise<{ ok: boolean }>;
      sendProcessInput: (
        input: string
      ) => Promise<{ ok: boolean; error?: string }>;
      runEnvironmentSetup: (options?: {
        source?: 'vendor' | 'pypi';
      }) => Promise<{ ok: boolean; error?: string }>;
      selectDirectoryDialog: () => Promise<string | null>;
      selectFileDialog: (filters?: any[]) => Promise<string | null>;
      onProcessLog: (cb: (entry: ProcessLogEntry) => void) => () => void;
      onProcessStateChange: (cb: (state: ProcessState) => void) => () => void;
      onStudyUpdated: (cb: (data: { filename: string }) => void) => () => void;
    };
  }
}
