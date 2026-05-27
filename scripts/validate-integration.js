import fs from 'node:fs';

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

function assert(condition, message) {
  if (!condition) fail(message);
}

const manifest = readJson('integration_manifest.json');
const memory = readJson('dubbing_memory.json');
const benchmarks = readJson('test/fixtures/translation_benchmark_cases.json');

assert(manifest.role === 'dubmn-memory-qa-source', 'manifest role must be dubmn-memory-qa-source');
assert(manifest.status === 'connected_to_canonical_app', 'manifest must mark repo connected to canonical app');
assert(manifest.canonical_app_repo === 'zaykamazuykama-wq/mongol-dub-genie', 'canonical app repo must be mongol-dub-genie');
assert(manifest.source_memory_repo === 'zaykamazuykama-wq/zaykama-dubbing-studio', 'source memory repo must be zaykama-dubbing-studio');

assert(manifest.exports.memory === 'dubbing_memory.json', 'manifest memory export path mismatch');
assert(fs.existsSync(manifest.exports.memory), 'memory export file missing');
assert(fs.existsSync(manifest.exports.benchmarks), 'benchmark export file missing');
assert(fs.existsSync(manifest.exports.validation_script), 'validation script missing');

assert(manifest.canonical_app_targets.memory_module === 'src/lib/dubbing-memory.ts', 'canonical memory module target mismatch');
assert(manifest.canonical_app_targets.worker_adapter === 'scripts/worker-translation-pipeline.mjs', 'canonical worker adapter target mismatch');

assert(memory.translation_pipeline?.name === '3-stage Mongolian dubbing translation pipeline', 'memory pipeline name mismatch');
assert(memory.translation_pipeline?.stages?.length === 3, 'memory must have 3 translation stages');
assert(Array.isArray(memory.translation_mappings) && memory.translation_mappings.length >= 6, 'memory must contain translation mappings');
assert(Array.isArray(memory.suspicious_asr_phrases) && memory.suspicious_asr_phrases.includes('Give it head'), 'memory must keep suspicious ASR phrases');
assert(memory.voice_policy?.forbidden?.includes('Do not clone'), 'voice policy must forbid cloning/impersonation without permission');

assert(benchmarks.version === 1, 'benchmark version must be 1');
assert(Array.isArray(benchmarks.cases) && benchmarks.cases.length >= 7, 'benchmark cases missing');
assert(benchmarks.cases.some((entry) => entry.id === 'jar-of-dirt-natural-object'), 'jar-of-dirt benchmark missing');
assert(benchmarks.cases.some((entry) => entry.id === 'give-it-head-asr-error'), 'give-it-head ASR benchmark missing');

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log('Integration validation passed');
