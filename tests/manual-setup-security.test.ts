import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const owner='owner@example.com';
const editorFunctions=['setupSheetDatabase','setupAuroraOwnerOnce','setupAuroraImagesOnce','backfillCustomerMasterOnce'];
function harness(active:string|undefined,effective=owner){
  const properties=new Map<string,string>();
  const effects={propertiesRead:0,propertiesWrite:0,sheet:0,drive:0,lock:0};
  const context:Record<string,any>={console:{log(){},error(){}},Date,JSON,Object,Array,String,Math,
    Session:active===undefined?undefined:{getActiveUser:()=>({getEmail:()=>active}),getEffectiveUser:()=>({getEmail:()=>effective})},
    PropertiesService:{getScriptProperties:()=>{
      effects.propertiesRead++;
      return {getProperty:(key:string)=>properties.get(key)||null,setProperty:(key:string,value:string)=>{effects.propertiesWrite++;properties.set(key,value);}};
    }},
    SpreadsheetApp:{openById:()=>{effects.sheet++;throw new Error('Unexpected spreadsheet access');},getActiveSpreadsheet:()=>{effects.sheet++;throw new Error('Unexpected spreadsheet access');}},
    DriveApp:{createFolder:()=>{effects.drive++;throw new Error('Unexpected Drive access');},getFolderById:(id:string)=>{effects.drive++;return {getId:()=>id,isTrashed:()=>false};}},
    LockService:{getScriptLock:()=>{effects.lock++;return {tryLock:()=>true,releaseLock(){}};}},
  };
  vm.createContext(context);
  for(const file of ['Code.gs','StaffOperations.gs','PublicImages.gs','CustomerMaster.gs'])
    vm.runInContext(fs.readFileSync(new URL('../apps-script/'+file,import.meta.url),'utf8'),context);
  return {context,properties,effects};
}

test('anonymous HtmlService visitors cannot invoke public editor setup or backfill using the effective owner identity',()=>{
  for(const fn of editorFunctions){
    const h=harness('');
    assert.throws(()=>h.context[fn](),/Run setup directly in the Apps Script editor/);
    assert.deepEqual(h.effects,{propertiesRead:0,propertiesWrite:0,sheet:0,drive:0,lock:0});
  }
});

test('a different signed-in Google account, missing Session service, or empty effective identity fails closed before private access',()=>{
  for(const [active,effective] of [['other@example.com',owner],[owner,''],[undefined,owner],['not-an-email','not-an-email']] as const){
    for(const fn of editorFunctions){
      const h=harness(active,effective);
      assert.throws(()=>h.context[fn](),/Run setup directly in the Apps Script editor/);
      assert.deepEqual(h.effects,{propertiesRead:0,propertiesWrite:0,sheet:0,drive:0,lock:0});
    }
  }
});

test('the interactive owner can initialize the allowlist once and reuse the existing private image folder',()=>{
  const h=harness('  OWNER@example.com  ');
  const result=h.context.setupAuroraOwnerOnce();
  assert.equal(result.owner_email,owner);
  assert.equal(JSON.parse(h.properties.get('AURORA_STAFF_USERS')||'{}')[owner].role,'super_admin');
  const before=JSON.stringify([...h.properties]);
  assert.throws(()=>h.context.setupAuroraOwnerOnce(),/already exists/);
  assert.equal(JSON.stringify([...h.properties]),before);
  h.properties.set('AURORA_PUBLIC_IMAGE_FOLDER_ID','existing-private-folder');
  assert.equal(h.context.setupAuroraImagesOnce(),'existing-private-folder');
  assert.equal(h.effects.drive,1);
  assert.equal(h.effects.sheet,0);
});
