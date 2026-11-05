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
