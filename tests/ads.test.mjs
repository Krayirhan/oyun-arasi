import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveMode, permitsAds, safeDistance, onceAsync } from '../ads-policy.js';
const config = { mode: 'live', publisherId: 'ca-pub-1185594059702325', liveHost: 'oyunarasi.site', cmpScriptUrl: 'https://fundingchoicesmessages.google.com/i/pub-1185594059702325' };
const location = { hostname: 'oyunarasi.site', protocol: 'https:', search: '' };
test('production requires explicit live mode, approved host and complete settings', () => {
  assert.equal(resolveMode(config, location), 'live');
  for (const change of [{mode:'off'}, {mode:'preview'}, {publisherId:''}, {cmpScriptUrl:''}, {cmpScriptUrl:'https://evil.test/i/a'}]) assert.equal(resolveMode({...config,...change},location),'off');
  for (const change of [{hostname:'www.oyunarasi.site'}, {hostname:'evil.test'}, {protocol:'http:'}]) assert.equal(resolveMode(config,{...location,...change}),'off');
});
test('preview override is local only', () => {
  assert.equal(resolveMode({...config,mode:'off'}, {...location,hostname:'localhost',search:'?ads=preview'}),'preview');
  assert.equal(resolveMode({...config,mode:'off'}, {...location,search:'?ads=preview'}),'off');
});
test('unknown, denied and unconfigured advertising purposes fail closed', () => {
  const status = { adStoragePurposeConsentStatus:1, adUserDataPurposeConsentStatus:1, adPersonalizationPurposeConsentStatus:3 };
  assert.equal(permitsAds(status),true);
  assert.equal(permitsAds(null),false);
  for(const value of [undefined,0,2,4]) assert.equal(permitsAds({...status,adStoragePurposeConsentStatus:value}),false);
});
test('game rectangle separation includes overlap and exact boundary', () => {
  const game={left:0,right:400,top:0,bottom:400};
  assert.equal(safeDistance({left:0,right:400,top:550,bottom:650},game),true);
  assert.equal(safeDistance({left:0,right:400,top:549,bottom:650},game),false);
  assert.equal(safeDistance(game,game),false);
});
test('concurrent callers and repeated initialization share one script attempt',async()=>{
  let attempts=0;
  const run=onceAsync(()=>{attempts++;});
  await Promise.all([run(),run(),run()]);
  await run();
  assert.equal(attempts,1);
  let failures=0;
  const fail=onceAsync(()=>{failures++;throw new Error('blocked');});
  await assert.rejects(fail()); await assert.rejects(fail());
  assert.equal(failures,1);
});
