const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { performance } = require('node:perf_hooks');
const source = fs.readFileSync('public/js/calendrier.js', 'utf8');
const code = source.slice(source.indexOf('function masquerPrenomsSeancesChevauchantes('), source.indexOf('function genererContenuLienPlusEvenements('));
const context = vm.createContext({ Date, Set });
vm.runInContext(code, context);
const optimized = context.masquerPrenomsSeancesChevauchantes;
const clone = events => JSON.parse(JSON.stringify(events));
function reference(events) {
  const sessions = events.filter(event => event.extendedProps?.type === 'seance');
  const overlaps = new Set();
  for (let i = 0; i < sessions.length; i++) {
    const start = new Date(sessions[i].start).getTime(), end = new Date(sessions[i].end).getTime();
    for (let j = i + 1; j < sessions.length; j++) {
      if (start < new Date(sessions[j].end).getTime() && new Date(sessions[j].start).getTime() < end) { overlaps.add(sessions[i]); overlaps.add(sessions[j]); }
    }
  }
  return sessions.map(event => overlaps.has(event));
}
const event = (id, start, end, type = 'seance') => ({ id, start, end, title: `Student ${id}`, classNames: [], extendedProps: { type } });
const fixtures = [];
for (let i = 0; i < 250; i++) {
  const start = Date.UTC(2034, 5, 5 + i % 9, 8, (i * 37) % 720);
  fixtures.push(event(i, new Date(start).toISOString(), new Date(start + [30, 60, 90, 120][i % 4] * 60000).toISOString()));
}
fixtures.push(event(251, '2034-07-01T23:30:00', '2034-07-02T01:00:00'), event(252, '2034-07-02T00:30:00', '2034-07-02T02:00:00'));
fixtures.push(event(253, '2034-07-03T10:00:00', '2034-07-03T11:00:00'), event(254, '2034-07-03T11:00:00', '2034-07-03T12:00:00'));
fixtures.push(event(255, '2034-07-03T10:00:00', '2034-07-03T14:00:00', 'indisponibilite'));
const checked = clone(fixtures);
assert.equal(optimized(checked), checked, 'Keep the same collection and order');
assert.deepEqual(checked.filter(item => item.extendedProps.type === 'seance').map(item => item.title === ''), reference(fixtures));
assert.equal(checked.at(-1).title, 'Student 255', 'Never anonymize unavailability as if it were a session');
const history = Array.from({ length: 1000 }, (_, i) => {
  const date = new Date(Date.UTC(2030, 0, 1 + Math.floor(i / 4))).toISOString().slice(0, 10), hour = 8 + i % 4 * 3;
  return event(i, `${date}T${String(hour).padStart(2, '0')}:00:00`, `${date}T${String(hour + 1).padStart(2, '0')}:00:00`);
});
let begin = performance.now(); reference(history); const oldMs = performance.now() - begin;
const copy = clone(history);
begin = performance.now(); optimized(copy); const newMs = performance.now() - begin;
assert.ok(newMs < oldMs * .25, `Large-history overlap calculation must be substantially faster: ${oldMs} / ${newMs}`);
console.log(`calendar overlap: PASS (identical privacy rules, 1000 sessions: reference ${oldMs.toFixed(1)}ms, optimized ${newMs.toFixed(1)}ms)`);
