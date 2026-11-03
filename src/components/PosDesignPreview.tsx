import React from 'react';
import {PosPrintModal} from './PosPrintModal';
import {createDemoReceiptOrder} from '../services/posPrinterService';
import {useGoogleSheetContent} from '../hooks/useGoogleSheetContent';
export default function PosDesignPreview(){
  const {data}=useGoogleSheetContent();
  const [order]=React.useState(()=>({
    ...createDemoReceiptOrder(),
    customer_name:'Sample customer · Print preview',
    delivery_address:'House 12, Road 3, Tangail Sadar, Dhaka Division, Bangladesh',
  }));
  return <><div className="fixed top-0 left-0 right-0 z-[60] text-center bg-amber-100 p-2 text-xs font-bold">LOCAL POS PREVIEW · Sample order · No live writes</div><PosPrintModal order={order} demo onClose={()=>{window.location.href='/'}} shopName={data.settings.shop_name} shopAddress={data.settings.address} shopPhone={data.settings.phone} shopLogoUrl={data.settings.logo_url} websiteUrl={data.settings.website_url} facebookUrl={data.settings.facebook_url}/></>;
}
