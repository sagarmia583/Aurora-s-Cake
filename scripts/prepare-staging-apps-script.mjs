/**
 * Prepare a production-independent Google Apps Script staging bundle.
 * Generated files are local and must never be pushed to an existing prod script.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const outputDir=path.join(root,'.aurora-staging-apps-script');
const pattern=/^[A-Za-z0-9_-]{25,150}$/;
const once=(s,search,label)=>{
  if(s.split(search).length!==2)throw new Error('Staging source mismatch: '+label);
};
export const sheetFingerprint=id=>createHash('sha256').update(id).digest('hex').slice(0,16);

export function createStagingCode(bundle,sheetId){
  if(!pattern.test(sheetId))throw new Error('Invalid staging Sheet ID');
  const match=bundle.match(/var AURORA_SPREADSHEET_ID = '([A-Za-z0-9_-]+)';/);
  if(!match)throw new Error('Original Sheet binding not found');
  const original=match[1];
  if(sheetId===original)throw new Error('REFUSED: production Sheet cannot be staging');
  const legacy="function auroraConfiguredId_() {\n"+
    "  return PropertiesService.getScriptProperties().getProperty('AURORA_SPREADSHEET_ID') || AURORA_SPREADSHEET_ID || '';\n}";
  const get="function doGet(e) {\n  try {";
  const post="function doPost(e) {\n  try {";
  const health="service:'aurora_public_content',release:AURORA_BACKEND_RELEASE,";
  for(const [str,label] of [[legacy,'Sheet guard'],[get,'GET guard'],[post,'POST guard'],[health,'health marker']])
    once(bundle,str,label);
  const guard=[
    "/* STAGING SAFETY: only the isolated private Google Sheet is accessible. */",
    "var AURORA_STAGING_SHEET_ID_='"+sheetId+"';",
    "function auroraStagingGuard_(){",
    "  var props=PropertiesService.getScriptProperties();",
    "  var configured=String(props.getProperty('AURORA_SPREADSHEET_ID')||'');",
    "  var backend=String(props.getProperty('AURORA_DATABASE_BACKEND')||'google_sheets').toLowerCase();",
    "  if(configured&&configured!==AURORA_STAGING_SHEET_ID_)",
    "    throw new Error('STAGING BLOCK: different spreadsheet in Script Properties');",
    "  if(backend!=='google_sheets')throw new Error('STAGING BLOCK: Sheets only');",
    "  return AURORA_STAGING_SHEET_ID_;",
    "}"
  ].join('\n')+'\n';
  let code=guard+bundle.replace(match[0],"var AURORA_SPREADSHEET_ID = '"+sheetId+"';");
  code=code.replace(legacy,"function auroraConfiguredId_() {\n  return auroraStagingGuard_();\n}");
  code=code.replace(get,"function doGet(e) {\n  auroraStagingGuard_();\n  try {");
  code=code.replace(post,"function doPost(e) {\n  auroraStagingGuard_();\n  try {");
  code=code.replace(health,health+"environment:'staging',staging_sheet_fingerprint:'"+
    sheetFingerprint(sheetId)+"',");
  code=code.replace(/var AURORA_RECEIPT_VIEW_BASE_='https:\/\/script\.google\.com\/macros\/s\/[^']+\/exec';/,
    "var AURORA_RECEIPT_VIEW_BASE_='';");
  code=code.replaceAll("if(typeof auroraNotifyOrderStage_==='function')",
    "if(false && typeof auroraNotifyOrderStage_==='function')");

  // Never let an unauthenticated first login claim the super-admin account.
  const firstLogin=/    if\(kind==='staff' && accounts\.rows\.length===0 && name==='admin'\)\{[\s\S]*?\n    \}\n    if\(!person\|\|/;
  if(!firstLogin.test(code))throw new Error('Implicit admin bootstrap source changed; fail closed.');
  code=code.replace(firstLogin,"    if(!person||");
  const ownerSetup=[
    "",
    "/** Staging only: editor-authorized, one-time first admin setup. */",
    "function setupAuroraStagingOwnerOnce(){",
    "  auroraStagingGuard_();",
    "  var owner=auroraRequireInteractiveSetup_();",
    "  var props=PropertiesService.getScriptProperties();",
    "  var password=String(props.getProperty('AURORA_STAGING_OWNER_PASSWORD')||'');",
    "  if(password.length<16||password.length>128||password.trim()!==password||",
    "    !/[A-Z]/.test(password)||!/[a-z]/.test(password)||",
    "    !/[0-9]/.test(password)||!/[^A-Za-z0-9]/.test(password))",
    "      throw new Error('Set a 16+ character strong staging admin password in Script Properties first.');",
    "  var lock=LockService.getScriptLock();",
    "  if(!lock.tryLock(10000))throw new Error('Staging admin setup is busy');",
    "  try{",
    "    var staff=auroraPrivateTable_(auroraSpreadsheet_(),'staff_accounts');",
    "    if(staff.rows.length!==0)throw new Error('Staff accounts already exist. Refusing setup.');",
    "    var salt=auroraAccountToken_(),now=new Date().toISOString();",
    "    auroraAppendPrivate_(staff,{id:'staff_'+Utilities.getUuid(),",
    "      username:'admin',name:'Staging Owner',role:'super_admin',",
    "      password_salt:salt,password_hash:auroraAccountHash_(password,salt),",
    "      failed_attempts:0,locked_until:0,active:true,",
    "      created_at:now,updated_at:now});",
    "    props.deleteProperty('AURORA_STAGING_OWNER_PASSWORD');",
    "    return {ok:true,configured:true,username:'admin',owner:owner,secret_deleted:true};",
    "  }finally{lock.releaseLock();}",
    "}"
  ].join('\n');
  code += ownerSetup + '\n';

  if(code.includes(original))throw new Error('REFUSED: production Sheet ID still exists in staging bundle');
  if(!code.includes("environment:'staging'"))throw new Error('Staging marker missing');
  return code;
}
export function prepareStaging({sheetId,outDir=outputDir}){
  if(path.resolve(outDir)===root)throw new Error('Cannot write staging files to project root');
  const bundle=fs.readFileSync(path.join(root,'apps-script','Code.AllInOne.gs'),'utf8');
  const code=createStagingCode(bundle,sheetId);
  fs.mkdirSync(outDir,{recursive:true});
  fs.writeFileSync(path.join(outDir,'Code.gs'),code);
  fs.writeFileSync(path.join(outDir,'appsscript.json'),JSON.stringify({
    timeZone:'Asia/Dhaka',exceptionLogging:'STACKDRIVER',runtimeVersion:'V8',
    webapp:{access:'ANYONE_ANONYMOUS',executeAs:'USER_DEPLOYING'}
  },null,2)+'\n');
  fs.writeFileSync(path.join(outDir,'.claspignore'),
    '.clasp.json\n.clasprc.json\nnode_modules/**\n');
  return {directory:outDir,fingerprint:sheetFingerprint(sheetId),bytes:Buffer.byteLength(code)};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const i=process.argv.indexOf('--sheet-id');
  const sheetId=i>=0?process.argv[i+1]||'':process.env.AURORA_STAGING_SHEET_ID||'';
  try{
    const r=prepareStaging({sheetId});
    console.log('Staging bundle ready:',r.directory,'fingerprint:',r.fingerprint);
    console.log('Create a NEW Apps Script project; never use a production script ID.');
  }catch(e){console.error('Staging preparation refused:',e.message);process.exitCode=1;}
}
