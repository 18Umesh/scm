import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import en from '../packages/i18n/en.json';
import te from '../packages/i18n/te.json';
import hi from '../packages/i18n/hi.json';
test('all languages have the same translation keys',()=>{for(const dictionary of [te,hi])assert.deepEqual(Object.keys(dictionary).sort(),Object.keys(en).sort());});
test('student runtime dependencies are restricted to the approved UI framework',async()=>{
  const pkg=JSON.parse(await readFile('apps/student/package.json','utf8'));assert.deepEqual(Object.keys(pkg.dependencies).sort(),['next','react','react-dom']);
  const config=await readFile('apps/student/next.config.mjs','utf8');assert.ok(config.includes("script-src 'self'"));assert.ok(!config.includes('https://'));
});
