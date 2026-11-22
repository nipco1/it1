const {test}=require('node:test'); const assert=require('node:assert/strict'); const ts=require('typescript'); const fs=require('node:fs'); const Module=require('node:module'); const path=require('node:path');
const file=path.resolve('src/lib/analytics.ts');const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;const mod=new Module(file,module);mod.filename=file;mod.paths=module.paths;mod._compile(code,file);const {operatingHoursTrend}=mod.exports;
const row=(equipmentId,dateKey,time,hours)=>({equipmentId,dateKey,time,hours});
test('newest-first input picks most recent measurement for each day',()=>{
 const records=[row('a','1405/01/03','10:00',130),row('a','1405/01/02','11:00',120),row('a','1405/01/02','08:00',115),row('a','1405/01/01','08:00',100),row('other','1405/01/02','12:00',999)];
 assert.deepEqual(operatingHoursTrend(records,'a',['1405/01/01','1405/01/02','1405/01/03','1405/01/04']),[0,20,30,30]);
 assert.equal(records[0].hours,130,'does not mutate input');
});
test('no reading is represented as missing, not a fake zero',()=>{
 const records=[row('a','1405/01/03','10:00',130),row('a','1405/01/04','10:00',140)];
 assert.deepEqual(operatingHoursTrend(records,'a',['1405/01/01','1405/01/02','1405/01/03','1405/01/04']),[null,null,0,10]);
 assert.deepEqual(operatingHoursTrend([],'a',['1405/01/01']),[null]);
});
