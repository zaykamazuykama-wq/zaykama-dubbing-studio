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

const memory = readJson('dubbing_memory.json');
const benchmarks = readJson('test/fixtures/translation_benchmark_cases.json');

const mappings = memory.translation_mappings || [];
const suspicious = memory.suspicious_asr_phrases || [];
const cases = benchmarks.cases || [];

function mappingFor(source) {
  return mappings.find((entry) => entry.source === source);
}

function caseFor(source) {
  return cases.find((entry) => entry.source === source);
}

function forbidsInMemory(source, phrase) {
  const entry = mappingFor(source);
  return !!entry && Array.isArray(entry.forbidden) && entry.forbidden.includes(phrase);
}

function forbidsInBenchmarks(source, phrase) {
  const entry = caseFor(source);
  return !!entry && Array.isArray(entry.forbidden) && entry.forbidden.includes(phrase);
}

assert(mappingFor('jar of dirt')?.target === 'шороотой лонх', 'jar of dirt must map to шороотой лонх');
assert(forbidsInMemory('jar of dirt', 'шороон сав'), 'шороон сав must be forbidden for jar of dirt');
assert(forbidsInBenchmarks('jar of dirt', 'шороон сав'), 'benchmark must forbid шороон сав for jar of dirt');

assert(mappingFor('Your dog will be fine')?.target === 'Нохой чинь зүгээр ээ', 'Your dog will be fine must map to Нохой чинь зүгээр ээ');
assert(forbidsInMemory('Your dog will be fine', 'Чиний нохой сайн байх болно'), 'Чиний нохой сайн байх болно must be forbidden for Your dog will be fine');
assert(forbidsInBenchmarks('Your dog will be fine', 'Чиний нохой сайн байх болно'), 'benchmark must forbid Чиний нохой сайн байх болно');

assert(mappingFor('Do not clock out')?.target === 'Одоо битгий тараарай', 'Do not clock out must map to Одоо битгий тараарай');
assert(caseFor('Do not clock out')?.expected === 'Одоо битгий тараарай', 'benchmark must expect Одоо битгий тараарай');

assert(mappingFor('Give me your hand')?.target === 'Надад гараа өг', 'Give me your hand must map to Надад гараа өг');
assert(caseFor('Give me your hand')?.expected === 'Надад гараа өг', 'benchmark must expect Надад гараа өг');

assert(suspicious.includes('Let’s miss you on'), 'Let’s miss you on must be suspicious ASR');
assert(caseFor('Let’s miss you on')?.must_flag_as_suspicious_asr === true, 'benchmark must flag Let’s miss you on as likely ASR error');

assert(suspicious.includes('Give it head'), 'Give it head must be suspicious ASR');
assert(caseFor('Give it head')?.must_flag_as_suspicious_asr === true, 'benchmark must flag Give it head as likely ASR error');

assert(forbidsInBenchmarks('We have 750,000 customers without service', 'үйлчилгээгүй үйлчлүүлэгч'), 'benchmark must forbid үйлчилгээгүй үйлчлүүлэгч');

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log('Memory validation passed');
