import test from 'node:test';
import assert from 'node:assert/strict';
import {migrationFreezeStatus} from '../cloudflare/shared.js';

test('maintenance metadata exposes only a boolean and exact ISO timestamp',()=>{
 const frozen_at='2026-10-30T04:30:00.000Z';
 assert.deepEqual(migrationFreezeStatus({writes_frozen:true,frozen_at,private_key:'never-return'}),{writes_frozen:true,frozen_at});
 assert.deepEqual(migrationFreezeStatus({writes_frozen:false,frozen_at}),{writes_frozen:false,frozen_at:null});
 assert.deepEqual(migrationFreezeStatus({}),{writes_frozen:null,frozen_at:null});
 assert.deepEqual(migrationFreezeStatus(null),{writes_frozen:null,frozen_at:null});
});

test('malformed freeze flags and timestamps cannot leak into health responses',()=>{
 for(const writes_frozen of ['true',1,{},null])assert.deepEqual(migrationFreezeStatus({writes_frozen,frozen_at:'secret'}),{writes_frozen:null,frozen_at:null});
 for(const frozen_at of ['private-key','2026-02-30T04:30:00.000Z','2026-10-30T04:30:00Z','2026-10-30T04:30:00.000Z?token=secret',{},null])
   assert.deepEqual(migrationFreezeStatus({writes_frozen:true,frozen_at}),{writes_frozen:true,frozen_at:null});
});
