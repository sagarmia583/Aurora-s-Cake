import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {useGoogleSheetContent} from '../src/hooks/useGoogleSheetContent';
import {DEFAULT_PUBLIC_SITE_DATA} from './catalog-fixture';
import {DEFAULT_SHEETS_ENDPOINT} from '../src/services/googleSheets';

test('restored offline catalog may show cakes but never enables an unverified COD checkout',()=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  const storage=new Map<string,string>([[
    'aurora_public_sheet_snapshot_v2',JSON.stringify({
      endpoint:DEFAULT_SHEETS_ENDPOINT,savedAt:'2026-10-01T00:00:00.000Z',
      data:{...DEFAULT_PUBLIC_SITE_DATA,order_submission_enabled:true,
        customer_order_profile_sync_enabled:true}
    })
  ]]);
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{
    getItem(key:string){return storage.get(key)||null;},
    setItem(key:string,value:string){storage.set(key,value);},
    removeItem(key:string){storage.delete(key);}
  }});
  try{
    const Spy=()=>{
      const model=useGoogleSheetContent();
      return React.createElement('div',{
        'data-checkout':String(model.data.order_submission_enabled),
        'data-profile':String(model.data.customer_order_profile_sync_enabled),
        'data-source':model.status.source,
        'data-products':String(model.data.products.length)
      });
    };
    const html=renderToStaticMarkup(React.createElement(Spy));
    assert.match(html,/data-source="saved_snapshot"/);
    assert.match(html,/data-checkout="false"/);
    assert.match(html,/data-profile="false"/);
    assert.match(html,/data-products="[1-9]/);
  }finally{
    if(previous)Object.defineProperty(globalThis,'localStorage',previous);
    else Reflect.deleteProperty(globalThis,'localStorage');
  }
});
