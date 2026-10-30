import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const files=['Code.gs','SeedData.gs','StaffOperations.gs','AccountAuth.gs','CustomerMaster.gs','CustomerAccounts.gs','CustomCakeRequests.gs','LiveCatalog.gs','PublicCms.gs','PublicImages.gs','CustomerSubscriptions.gs','Campaigns.gs','SupabaseStore.gs'];
const banner=`/**
 * AURORA'S CAKE — ONE-FILE Google Apps Script backend.
 * Rebuilt from the individual apps-script modules by scripts/build-apps-script.mjs.
 * Customer accounts, saved delivery profiles and product-email preferences stay private.
 * Replace the complete deployed Code.gs; run setupSheetDatabase(), then setupCampaignTools()
 * as the bakery owner to authorize mail and install the Sheet menu. Neither setup sends email.
 * Deploy a NEW Web App version using Execute as Me / access Anyone.
 */\n\n`;
const content=banner+files.map(file=>`/* ==== BEGIN apps-script/${file} ==== */\n`+fs.readFileSync(path.join(root,'apps-script',file),'utf8').replace(/^\uFEFF/,'').replace(/\r\n/g,'\n').trimEnd()+`\n/* ==== END apps-script/${file} ==== */\n`).join('\n');
const destination=path.join(root,'apps-script','Code.AllInOne.gs');
if(process.argv.includes('--check')){
  if(fs.readFileSync(destination,'utf8')!==content){console.error('Apps Script bundle is stale. Run node scripts/build-apps-script.mjs.');process.exitCode=1;}
  else console.log('Apps Script bundle matches all source modules.');
}else{fs.writeFileSync(destination,content);console.log(`Bundled ${files.length} Apps Script modules (${Buffer.byteLength(content)} bytes).`);}
