import test from 'node:test';
import assert from 'node:assert/strict';
import {createStagingCode,sheetFingerprint} from '../scripts/prepare-staging-apps-script.mjs';
import {acceptStagingStaff} from '../scripts/accept-staging-staff.mjs';
import {readFileSync} from 'node:fs';

const bundle=readFileSync(new URL('../apps-script/Code.AllInOne.gs',import.meta.url),'utf8');
const sheetId='1ISOLATED_TEST_STAGING_SHEET_ABCDEFG_123456';
const orderId='ord_8e42ea25-120e-4e48-a0f3-9ed18ecf7e9f';
const execUrl='https://script.google.com/macros/s/AKfycbSynthetic_12345/exec';
test('staging generator removes public first-login admin takeover and embeds editor-only setup',()=>{
  const built=createStagingCode(bundle,sheetId);
  assert.doesNotMatch(built,/if\(kind==='staff' && accounts\.rows\.length===0 && name==='admin'\)/);
  assert.match(built,/function setupAuroraStagingOwnerOnce\(\)/);
  assert.match(built,/auroraRequireInteractiveSetup_\(\)/);
  assert.match(built,/AURORA_STAGING_OWNER_PASSWORD/);
  assert.match(built,/props\.deleteProperty\('AURORA_STAGING_OWNER_PASSWORD'\)/);
  assert.match(built,/staging_auth_hardened:true/);
});
function fixture(hardened=true) {
  let current={id:orderId,status:'pending',payment_status:'pending',cod_collected:false,
    cod_amount:360,total_amount:360};
  const roles={admin:'super_admin'},passwords={admin:'SecureStagingOwnerPassword!2026'};
  const calls=[],sequence=[];
  let counter=0;
  const tokens={};
  const forbidden={confirm:['order_manager'],start_baking:['kitchen_manager'],
    mark_ready:['kitchen_manager'],assign:['delivery_manager'],
    pick_up:['delivery_man'],start_delivery:['delivery_man'],deliver:['delivery_man']};
  const fetcher=async(url,init)=>{
    const address=String(url);
    const action=address.includes('?action=health')?'health':JSON.parse(init.body).action;
    const input=action==='health'?{}:JSON.parse(init.body);
    calls.push({method:init.method,action:input.action||'health'});
    let out;
    if(action==='health')out={ok:true,environment:'staging',staging_auth_hardened:hardened,
      staging_sheet_fingerprint:sheetFingerprint(sheetId),database_backend:'google_sheets',
      writes_frozen:false};
    else if(action==='staff_password_login'){
      const role=roles[input.username];
      out=role&&passwords[input.username]===input.password
        ?{ok:true,role,auth_token:'token-'+input.username,name:'Staging'}
        :{ok:false,code:'invalid_credentials'};
      if(out.ok)tokens[out.auth_token]=role;
    }else if(action==='staff_orders'){
      out=tokens[input.auth_token]==='super_admin'
        ?{ok:true,snapshot_complete:true,orders:[{...current}]}
        :{ok:false,code:'forbidden'};
    }else if(action==='staff_account_create'){
      if(tokens[input.auth_token]!=='super_admin')out={ok:false,code:'forbidden'};
      else{
        roles[input.username]=input.role;
        passwords[input.username]=input.password;
        out={ok:true,created:true};
      }
    }else if(action==='staff_account_set_active'){
      out=tokens[input.auth_token]==='super_admin'?{ok:true,updated:true}:{ok:false,code:'forbidden'};
    }else if(action==='staff_password_logout'){
      out=tokens[input.auth_token] ? {ok:true,revoked:true}:{ok:false,code:'unauthorized'};
      delete tokens[input.auth_token];
    }else if(action==='staff_mutate'){
      const role=tokens[input.auth_token];
      const allowed=forbidden[input.operation]||[];
      if(role!=='super_admin'&&!allowed.includes(role))out={ok:false,code:'forbidden'};
      else if(input.operation==='deliver'&&input.cash_collected!==true)
        out={ok:false,code:'cash_unconfirmed'};
      else{
        const stages={confirm:'confirmed',start_baking:'preparing',mark_ready:'ready',
          assign:'assigned',pick_up:'picked_up',start_delivery:'out_for_delivery',
          deliver:'delivered'};
        const next=stages[input.operation];
        if(!next)out={ok:false,code:'invalid_action'};
        else{
          current={...current,status:next};
          if(next==='delivered')current={...current,payment_status:'paid',cod_collected:true};
          sequence.push(next);
          out={ok:true,order:{...current}};
        }
      }
    }else throw new Error('Unexpected staged test action '+action);
    counter++;
    return new Response(JSON.stringify(out),{status:200,
      headers:{'Content-Type':'application/json'}});
  };
  return {fetcher,calls,sequence,getCurrent:()=>current};
}
test('read-only preflight makes one health GET and no staff POST',async()=>{
  const f=fixture();
  const v=await acceptStagingStaff({url:execUrl,sheetId,orderId,expectedTotal:360,
    fetcher:f.fetcher});
  assert.equal(v.mode,'preflight');
  assert.deepEqual(f.calls,[{method:'GET',action:'health'}]);
});
test('outdated staging auth code is rejected before password or any mutations',async()=>{
  const f=fixture(false);
  await assert.rejects(()=>acceptStagingStaff({url:execUrl,sheetId,orderId,
    expectedTotal:360,commit:true,adminPassword:'SecureStagingOwnerPassword!2026',
    fetcher:f.fetcher}),/redeploy hardened staging Code/);
  assert.equal(f.calls.filter(c=>c.method==='POST').length,0);
});
test('authenticated staging full staff flow checks roles and cash, then disables test roles',async()=>{
  const f=fixture();
  const result=await acceptStagingStaff({url:execUrl,sheetId,orderId,expectedTotal:360,
    commit:true,adminPassword:'SecureStagingOwnerPassword!2026',fetcher:f.fetcher});
  assert.equal(result.final_status,'delivered');
  assert.equal(result.payment_status,'paid');
  assert.equal(result.cod_amount,360);
  assert.equal(result.cash_unconfirmed_denied,true);
  assert.equal(result.temporary_roles_created,5);
  assert.equal(result.temporary_roles_disabled,5);
  assert.deepEqual(f.sequence,
    ['confirmed','preparing','ready','assigned','picked_up','out_for_delivery','delivered']);
  assert.equal(f.getCurrent().cod_collected,true);
  assert.equal(f.calls.filter(x=>x.action==='staff_account_set_active').length,5);
});
test('invalid URL and wrong order ID are blocked without network calls',async()=>{
  const f=fixture();
  for(const value of ['https://aurorascake.netlify.app/api/operations',
    'http://script.google.com/macros/s/bad/exec']){
    await assert.rejects(()=>acceptStagingStaff({url:value,sheetId,orderId,expectedTotal:360,
      commit:true,adminPassword:'SecureStagingOwnerPassword!2026',fetcher:f.fetcher}));
  }
  await assert.rejects(()=>acceptStagingStaff({url:execUrl,sheetId,
    orderId:'ord_NOT_A_VALID_UUID',expectedTotal:360,fetcher:f.fetcher}));
  assert.equal(f.calls.length,0);
});

test('a failed intermediate stage still deactivates all newly created staff accounts',async()=>{
  const f=fixture();
  const guarded=async(url,options)=>{
    if(options.method==='POST'){
      const input=JSON.parse(options.body);
      if(input.action==='staff_mutate'&&input.operation==='mark_ready'){
        return new Response(JSON.stringify({ok:false,code:'simulated_stage_failure'}),{
          status:200,headers:{'Content-Type':'application/json'}
        });
      }
    }
    return f.fetcher(url,options);
  };
  await assert.rejects(()=>acceptStagingStaff({
    url:execUrl,sheetId,orderId,expectedTotal:360,commit:true,
    adminPassword:'SecureStagingOwnerPassword!2026',fetcher:guarded
  }),/mark_ready failed/);
  const all=f.calls.filter(x=>x.action==='staff_account_set_active');
  assert.equal(all.length,5,'all five created accounts must be disabled on failure');
  assert.deepEqual(f.sequence,['confirmed','preparing'],
    'real stages can be partially committed; must not pretend rollback');
});


test('staging password reset runs only as editor owner, resets failed attempts and revokes sessions',async()=>{
  const {runInNewContext}=await import('node:vm');
  const generated=createStagingCode(bundle,sheetId);
  const marker='function resetAuroraStagingOwnerPasswordOnce(){';
  assert.equal(generated.split(marker).length,2,'reset function must occur exactly once');
  const isolatedFunction=generated.slice(generated.indexOf(marker));
  assert.match(isolatedFunction,/auroraStagingGuard_\(\)/);
  assert.match(isolatedFunction,/auroraRequireInteractiveSetup_\(\)/);
  assert.match(isolatedFunction,/AURORA_STAGING_OWNER_RESET_PASSWORD/);
  assert.match(isolatedFunction,/props.deleteProperty\('AURORA_STAGING_OWNER_RESET_PASSWORD'\)/);
  const props=new Map(),saved=[],revoked=[];
  const person={id:'staff-isolated-test',username:'admin',role:'super_admin',
    active:true,password_salt:'old',password_hash:'oldhash',
    failed_attempts:1,locked_until:0};
  const people=[person],lock={tryLock:()=>true,releaseLock:()=>{}};
  let editorAuthorized=false,guarded=0;
  const context={
    auroraStagingGuard_:()=>{guarded++;},
    auroraRequireInteractiveSetup_:()=>{if(!editorAuthorized)throw Error('Not an interactive owner');return 'staging-owner@example.test';},
    PropertiesService:{getScriptProperties:()=>({
      getProperty:key=>props.get(key)||null,
      deleteProperty:key=>props.delete(key)
    })},
    LockService:{getScriptLock:()=>lock},
    auroraPrivateTable_:()=>({rows:people}),
    auroraSpreadsheet_:()=>({}),
    auroraAccountToken_:()=>('new_random_salt'),
    auroraAccountHash_:(secret,salt)=>'hashed('+secret.length+','+salt+')',
    auroraAccountSave_:(_,p)=>saved.push({...p}),
    auroraAccountRevokeAll_:(kind,id)=>revoked.push([kind,id]),
    Date
  };
  runInNewContext(isolatedFunction,context);
  props.set('AURORA_STAGING_OWNER_RESET_PASSWORD','NewIsolatedStagingOwnerPassword2026!');
  assert.throws(()=>context.resetAuroraStagingOwnerPasswordOnce(),/interactive owner/);
  assert.equal(saved.length,0);
  editorAuthorized=true;
  const previousHash=person.password_hash;
  const result=context.resetAuroraStagingOwnerPasswordOnce();
  assert.equal(result.ok,true);
  assert.equal(result.reset,true);
  assert.equal(result.secret_deleted,true);
  assert.equal(guarded,2);
  assert.equal(person.failed_attempts,0);
  assert.equal(person.locked_until,0);
  assert.notEqual(person.password_hash,previousHash);
  assert.equal(saved.length,1);
  assert.deepEqual(revoked,[['staff','staff-isolated-test']]);
  assert.equal(props.has('AURORA_STAGING_OWNER_RESET_PASSWORD'),false);
  assert.throws(()=>context.resetAuroraStagingOwnerPasswordOnce(),/new unique/);
  props.set('AURORA_STAGING_OWNER_RESET_PASSWORD','AnotherNewOwnerPassword2026!Safe');
  people.push({...person,id:'duplicate-admin'});
  assert.throws(()=>context.resetAuroraStagingOwnerPasswordOnce(),/Exactly one active staging super_admin/);
  assert.equal(saved.length,1,'duplicate admin must not be mutated');
});


test('new login-only mode authenticates an owner and pending order without stage mutations',async()=>{
  const f=fixture();
  const result=await acceptStagingStaff({url:execUrl,sheetId,orderId,
    expectedTotal:360,loginOnly:true,adminPassword:'SecureStagingOwnerPassword!2026',
    fetcher:f.fetcher});
  assert.equal(result.mode,'login_check');
  assert.equal(result.admin_verified,true);
  assert.equal(result.order_pending,true);
  assert.equal(result.no_staff_or_order_mutations,true);
  assert.equal(f.calls.filter(x=>x.action==='staff_account_create').length,0);
  assert.equal(f.calls.filter(x=>x.action==='staff_mutate').length,0);
  assert.equal(f.calls.filter(x=>x.action==='staff_password_logout').length,1);
  assert.equal(f.getCurrent().status,'pending');
});
test('invalid admin login-only password fails before creating test employees',async()=>{
  const f=fixture();
  await assert.rejects(()=>acceptStagingStaff({url:execUrl,sheetId,orderId,
    expectedTotal:360,loginOnly:true,adminPassword:'WrongOwnerSecret2026!Pass',
    fetcher:f.fetcher}),/Owner login failed \(invalid_credentials\)/);
  assert.equal(f.calls.filter(x=>x.action==='staff_account_create').length,0);
  assert.equal(f.calls.filter(x=>x.action==='staff_mutate').length,0);
  assert.equal(f.getCurrent().status,'pending');
});
test('consolidated Windows wizard checks only existing staging project, uses hidden password and one-time marker',()=>{
  const wizard=readFileSync(new URL('../scripts/aurora-staging-one-command.ps1',import.meta.url),'utf8');
  assert.match(wizard,/existing isolated staging project/i);
  assert.match(wizard,/\$config\.scriptId -cne \$scriptId/);
  assert.match(wizard,/\$stagingSheetId -ceq \$productionSheetId/);
  assert.match(wizard,/Code\.AllInOne\.gs/);
  assert.match(wizard,/staging_auth_hardened:true/);
  assert.match(wizard,/resetAuroraStagingOwnerPasswordOnce/);
  assert.match(wizard,/RUN-STAGING-STAFF/);
  assert.match(wizard,/Read-Host 'STAGING admin password \(hidden\)' -AsSecureString/);
  assert.match(wizard,/Env:\\AURORA_STAGING_ADMIN_PASSWORD/);
  assert.match(wizard,/FileMode\]::CreateNew/);
  assert.match(wizard,/--login-only/);
  assert.match(wizard,/--commit/);
  const nativeClaspLines=wizard.split('\n').map(line=>line.trim())
    .filter(line=>line.startsWith('& $clasp'));
  assert.deepEqual(nativeClaspLines,["& $clasp 'push'"]);
  assert.doesNotMatch(wizard,/& \$clasp '(?:deploy|clone|create|run)'/);
  assert.doesNotMatch(wizard,/New-Item.*[Cc]reate.*(?:Apps Script|[Ss]preadsheet)/);
});


test('fresh ZIP wizard creates only an explicit existing staging clasp link',()=>{
  const wizard=readFileSync(new URL('../scripts/aurora-staging-one-command.ps1',import.meta.url),'utf8');
  const start=wizard.indexOf('function Initialize-ExistingStagingLink {');
  const end=wizard.indexOf('function Assert-StagingTarget {');
  assert.ok(start>=0&&end>start,'staging link function must precede target assertion');
  const link=wizard.slice(start,end);
  assert.match(link,/if\(Test-Path -LiteralPath \$claspConfig\)\{return\}/);
  assert.match(link,/if\(\$Mode -ne 'All'\)/);
  assert.match(link,/\$typed\.Trim\(\) -cne \$scriptId/);
  assert.match(link,/WriteAllText\(\$claspConfig,\$json,\$utf8\)/);
  assert.match(link,/scriptId=\$scriptId;rootDir='\.'/);
  assert.match(link,/UTF8Encoding\(\$false\)/);
  assert.ok(wizard.includes('Initialize-ExistingStagingLink\nAssert-StagingTarget'));
  assert.doesNotMatch(link,/& \$clasp\s+(?:create|clone|deploy)/i);
  assert.doesNotMatch(link,/New-Item.*(?:[Ss]preadsheet|[Dd]atabase|Apps Script project)/);
  assert.match(wizard,/Assert-StagingTarget\nif\(\$Mode -ne 'Check'/);
});
