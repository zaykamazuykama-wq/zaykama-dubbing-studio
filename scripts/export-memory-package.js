import fs from 'node:fs';
import path from 'node:path';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

const manifest = readJson('integration_manifest.json');
const memory = readJson('dubbing_memory.json');
const benchmarks = readJson('test/fixtures/translation_benchmark_cases.json');

const outDir = 'dist';
fs.mkdirSync(outDir, { recursive: true });

const exportedAt = new Date().toISOString();
const memoryPackage = {
  exported_at: exportedAt,
  source_repo: manifest.source_memory_repo,
  canonical_app_repo: manifest.canonical_app_repo,
  integration_status: manifest.status,
  memory,
  benchmarks,
  canonical_app_targets: manifest.canonical_app_targets,
};

const packagePath = path.join(outDir, 'dubmn-memory-package.json');
fs.writeFileSync(packagePath, JSON.stringify(memoryPackage, null, 2) + '\n');

const summaryPath = path.join(outDir, 'dubmn-memory-summary.md');
fs.writeFileSync(summaryPath, [
  '# DubMN Memory Export Summary',
  '',
  `Exported at: ${exportedAt}`,
  `Source repo: ${manifest.source_memory_repo}`,
  `Canonical app repo: ${manifest.canonical_app_repo}`,
  '',
  '## Contents',
  '',
  `- Translation mappings: ${memory.translation_mappings?.length || 0}`,
  `- Suspicious ASR phrases: ${memory.suspicious_asr_phrases?.length || 0}`,
  `- Translation pipeline stages: ${memory.translation_pipeline?.stages?.length || 0}`,
  `- Benchmark cases: ${benchmarks.cases?.length || 0}`,
  '',
  '## Canonical app target files',
  '',
  `- Memory module: ${manifest.canonical_app_targets.memory_module}`,
  `- Memory tests: ${manifest.canonical_app_targets.memory_tests}`,
  `- Worker adapter: ${manifest.canonical_app_targets.worker_adapter}`,
  `- Worker demo: ${manifest.canonical_app_targets.worker_demo}`,
  '',
].join('\n'));

console.log(`Exported ${packagePath}`);
console.log(`Exported ${summaryPath}`);
