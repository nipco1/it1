import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateControl} from '../src/control-validation.js';
const checklist = [{id:'safety',kind:'oknok'}, {id:'pressure',kind:'numeric',min:10,max:20,precision:2}];
const form = () => ({equipmentId:'eq-one',dateKey:'1405/09/01',shiftId:'s1',startedAt:'1405/09/01 - 06:30',opHours:null,items:{ safety:{itemId:'safety',result:'ok'},pressure:{itemId:'pressure',value:12,result:'ok'} }});

test('server derives numeric result and completed status from the trusted checklist', () => {
  const clean = validateControl(form(),checklist);
  assert.equal(clean.items.pressure.result, 'ok'); assert.equal(clean.status,'completed');
});
test('numeric out-of-range and NOK require location and description', () => {
  const f=form();f.items.pressure.value=25;f.items.pressure.result='nok';
  assert.equal(validateControl(f,checklist),null);
  f.items.pressure.failLocId='fl';f.items.pressure.desc='  leaking  ';
  const clean=validateControl(f,checklist); assert.equal(clean.status,'nok');assert.equal(clean.items.pressure.result,'nok');assert.equal(clean.items.pressure.desc,'  leaking  ');
});
test('rejects missing, injected, malformed and invalid checklist answers', () => {
  for (const mutate of [
    f=>delete f.items.safety,
    f=>f.items.extra={itemId:'extra',result:'ok'},
    f=>f.items.safety.result=null,
    f=>f.items.pressure.value=Infinity,
    f=>f.items.pressure.itemId='wrong',
    f=>f.dateKey='1405/99/99',
    f=>f.shiftId='unknown',
    f=>f.opHours='100',
  ]) {const f=form(); mutate(f);assert.equal(validateControl(f,checklist),null);}
  assert.equal(validateControl(form(),[]),null);
});
test('ignores client supplied user and status to prevent impersonation', () => {
  const f=form();f.techId='another-user'; f.status='cancelled';
  const clean=validateControl(f,checklist);assert.equal(Object.hasOwn(clean,'techId'),false);assert.equal(clean.status,'completed');
});
test('negative operating hours are rejected by the server', () => {
  const f=form();f.opHours=-1;assert.equal(validateControl(f,checklist),null);
  f.opHours=0;assert.ok(validateControl(f,checklist));
});
test('rejects impossible Jalali calendar dates including non-leap Esfand', () => {
  for (const date of ['1404/07/31','1404/12/30','1403/12/31','4000/01/01']) {const f=form();f.dateKey=date;assert.equal(validateControl(f,checklist),null,date);}
  for (const date of ['1403/12/30','1404/12/29','1404/06/31']) {const f=form();f.dateKey=date;assert.ok(validateControl(f,checklist),date);}
});

test('numeric precision comes from the stored checklist, not client input', () => {
  const precise = [{id:'temperature',kind:'numeric',min:0,max:100,precision:1}];
  const body = {equipmentId:'press-1',dateKey:'1405/09/01',shiftId:'s1',startedAt:'1405/09/01 - 06:30',items:{temperature:{itemId:'temperature',value:12.3,result:'ok'}}};
  assert.ok(validateControl(body, precise));
  body.items.temperature.value=12.34;
  assert.equal(validateControl(body, precise), null);
});
