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

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const memory = readJson('dubbing_memory.json');
const benchmarks = readJson('test/fixtures/translation_benchmark_cases.json');

const mappings = memory.translation_mappings || [];
const suspicious = memory.suspicious_asr_phrases || [];
const cases = benchmarks.cases || [];

function mappingFor(source) {
  return mappings.find((entry) => normalize(entry.source) === normalize(source));
}

function memoryTarget(source) {
  return mappingFor(source)?.target || memory[normalize(source)] || memory[String(source || '').toLowerCase()];
}

function caseFor(source) {
  return cases.find((entry) => normalize(entry.source) === normalize(source));
}

function forbidsInMemory(source, phrase) {
  const entry = mappingFor(source);
  return !!entry && Array.isArray(entry.forbidden) && entry.forbidden.includes(phrase);
}

function forbidsInBenchmarks(source, phrase) {
  const entry = caseFor(source);
  return !!entry && Array.isArray(entry.forbidden) && entry.forbidden.includes(phrase);
}

assert(memoryTarget('jar of dirt') === 'шороотой лонх', 'jar of dirt must map to шороотой лонх');
assert(forbidsInMemory('jar of dirt', 'шороон сав'), 'шороон сав must be forbidden for jar of dirt');
assert(forbidsInBenchmarks('jar of dirt', 'шороон сав'), 'benchmark must forbid шороон сав for jar of dirt');

assert(memoryTarget('Your dog will be fine') === 'Нохой чинь зүгээр ээ', 'Your dog will be fine must map to Нохой чинь зүгээр ээ');
assert(forbidsInMemory('Your dog will be fine', 'Чиний нохой сайн байх болно'), 'Чиний нохой сайн байх болно must be forbidden for Your dog will be fine');
assert(forbidsInBenchmarks('Your dog will be fine', 'Чиний нохой сайн байх болно'), 'benchmark must forbid Чиний нохой сайн байх болно');

assert(memoryTarget('Do not clock out') === 'Одоо битгий тараарай', 'Do not clock out must map to Одоо битгий тараарай');
assert(caseFor('Do not clock out')?.expected === 'Одоо битгий тараарай', 'benchmark must expect Одоо битгий тараарай');

assert(memoryTarget('Give me your hand') === 'Надад гараа өг' || memoryTarget('Give me your hand') === 'Надад гараа өг.', 'Give me your hand must map to Надад гараа өг');
assert(caseFor('Give me your hand')?.expected === 'Надад гараа өг', 'benchmark must expect Надад гараа өг');

assert(suspicious.includes('Let’s miss you on') || suspicious.includes("Let's miss you on"), 'Let’s miss you on must be suspicious ASR');
assert(caseFor('Let’s miss you on')?.must_flag_as_suspicious_asr === true, 'benchmark must flag Let’s miss you on as likely ASR error');

assert(suspicious.includes('Give it head'), 'Give it head must be suspicious ASR');
assert(caseFor('Give it head')?.must_flag_as_suspicious_asr === true, 'benchmark must flag Give it head as likely ASR error');

assert(forbidsInBenchmarks('We have 750,000 customers without service', 'үйлчилгээгүй үйлчлүүлэгч'), 'benchmark must forbid үйлчилгээгүй үйлчлүүлэгч');

assert(memory.translation_pipeline?.name === '3-stage Mongolian dubbing translation pipeline', 'memory must define 3-stage translation pipeline');
assert(memory.translation_pipeline?.stages?.length === 3, 'translation pipeline must have 3 stages');

for (const field of [
  'draftMongolianText',
  'editorMongolianText',
  'mongolianText',
  'translationStage',
  'translationReviewApplied',
  'translationReviewReason',
  'translationTooLiteral',
  'translationTooLong',
  'translationNeedsReview',
  'emotion',
  'style',
  'delivery',
  'speakerId',
  'characterId',
  'voiceId',
  'providerVoiceId',
  'voiceAssignmentMode',
  'ttsCacheKey',
  'ttsCacheHit',
  'ttsCachedPath'
]) {
  assert(memory.segment_metadata_plan?.includes(field), `segment metadata plan missing ${field}`);
}

for (const marker of ['neutral', 'calm', 'sad', 'angry', 'excited', 'fearful', 'whisper', 'laughing', 'smiling', 'serious', 'dramatic', 'soft', 'firm', 'reassuring']) {
  assert(memory.emotion_style_marker_plan?.includes(marker), `emotion/style marker missing ${marker}`);
}

assert(memory.delivery_marker_plan?.pace?.includes('slow'), 'delivery pace missing slow');
assert(memory.delivery_marker_plan?.pace?.includes('normal'), 'delivery pace missing normal');
assert(memory.delivery_marker_plan?.pace?.includes('fast'), 'delivery pace missing fast');
assert(memory.delivery_marker_plan?.emphasis_words === true, 'delivery plan missing emphasis words');
assert(memory.delivery_marker_plan?.pauseBeforeMs === true, 'delivery plan missing pauseBeforeMs');
assert(memory.delivery_marker_plan?.pauseAfterMs === true, 'delivery plan missing pauseAfterMs');

for (const keyPart of ['provider', 'providerVoiceId', 'final mongolianText', 'emotion', 'style', 'delivery pace', 'rate/speed', 'output format']) {
  assert(memory.tts_cache_plan?.cache_key_includes?.includes(keyPart), `TTS cache key missing ${keyPart}`);
}

assert(memory.voice_policy?.allowed?.includes('age/gender/timbre/energy/emotion'), 'voice policy must require similar voice assignment by age/gender/timbre/energy/emotion');
assert(memory.voice_policy?.forbidden?.includes('Do not clone or impersonate a real person without explicit permission'), 'voice policy must forbid cloning/impersonation without explicit permission');

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log('Memory validation passed');
