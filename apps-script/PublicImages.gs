/**
 * Free private Google Drive storage for small public bakery images.
 * The Web App runs as owner. Only authenticated Admin uploads.
 * Public GET is restricted to files in this dedicated generated folder.
 * Raw Google Drive file links and unrelated Drive files are never exposed.
 */
var AURORA_IMAGE_MAX_BYTES_=650000;
var AURORA_IMAGE_FOLDER_PROP_='AURORA_PUBLIC_IMAGE_FOLDER_ID';
function auroraImageFolder_(create){
  var props=PropertiesService.getScriptProperties(),id=props.getProperty(AURORA_IMAGE_FOLDER_PROP_);
  if(id){
    var existing=DriveApp.getFolderById(id);
    if(existing.isTrashed())auroraReject_('not_ready','Image folder has been deleted.');
    return existing;
  }
  if(!create)auroraReject_('not_found','Public bakery images have not been initialized.');
  var folder=DriveApp.createFolder('AurorasCake_Web_Images_'+Utilities.getUuid());
  props.setProperty(AURORA_IMAGE_FOLDER_PROP_,folder.getId());
  return folder;
}
/**
 * Run this ONCE from the Apps Script editor as the spreadsheet owner.
 * This authorizes DriveApp scope and creates a private image-only folder.
 * Existing folder is reused; the folder is never made public.
 */
function setupAuroraImagesOnce(){
  return auroraImageFolder_(true).getId();
}
function auroraImageMime_(bytes){
  if(bytes.length>3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
  if(bytes.length>8&&bytes.slice(0,8).join(',')==='137,80,78,71,13,10,26,10')return 'image/png';
  if(bytes.length>12&&String.fromCharCode.apply(null,bytes.slice(0,4))==='RIFF'&&
    String.fromCharCode.apply(null,bytes.slice(8,12))==='WEBP')return 'image/webp';
  auroraReject_('invalid_image','Only genuine JPEG, PNG or WebP images are supported.');
}
function auroraImageUpload_(input){
  var actor=auroraStaffAuthenticate_(input);
  if(actor.role!=='super_admin'&&actor.role!=='admin')auroraReject_('forbidden','Only the shop administrator can upload public images.');
  if(typeof input.base64!=='string'||!/^([A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.base64)||
      input.base64.length>Math.ceil(AURORA_IMAGE_MAX_BYTES_*4/3)+8)
    auroraReject_('invalid_image','Please resize or compress the image (max 650 KB).');
  var bytes=Utilities.base64Decode(input.base64);
  if(bytes.length===0||bytes.length>AURORA_IMAGE_MAX_BYTES_)auroraReject_('invalid_image','Image is too large.');
  // Apps Script base64Decode returns signed bytes; normalize for magic detection.
  var positive=bytes.map(function(b){return (b+256)%256;});
  var mime=auroraImageMime_(positive);
  if(input.mime_type&&input.mime_type!==mime)auroraReject_('invalid_image','Image file content does not match its type.');
  var extension=mime==='image/jpeg'?'jpg':mime==='image/png'?'png':'webp';
  var cache=CacheService.getScriptCache(),key='aurora_image_hour_'+auroraAccountDigest_(actor.email).slice(0,20);
  var count=Number(cache.get(key)||0);
  if(count>=20)auroraReject_('rate_limited','Image upload limit reached. Try again later.');
  cache.put(key,String(count+1),3600);
  var folder=auroraImageFolder_(true);
  var file=folder.createFile(Utilities.newBlob(bytes,mime,'aurora_'+Utilities.getUuid()+'.'+extension));
  return {ok:true,url:'/api/image?id='+file.getId(),mime_type:mime,bytes:bytes.length};
}
function auroraPublicImage_(id){
  if(!/^[A-Za-z0-9_-]{12,150}$/.test(String(id||'')))auroraReject_('not_found','Unknown image.');
  var folder=auroraImageFolder_(false),file=DriveApp.getFileById(id);
  if(file.isTrashed()||!['image/jpeg','image/png','image/webp'].includes(file.getMimeType()))
    auroraReject_('not_found','Image not found.');
  var parents=file.getParents(),owned=false;
  while(parents.hasNext()){if(parents.next().getId()===folder.getId()){owned=true;break;}}
  if(!owned)auroraReject_('not_found','Image not found.');
  if(file.getSize()>AURORA_IMAGE_MAX_BYTES_)auroraReject_('too_large','Image exceeds the public delivery limit.');
  var raw=file.getBlob().getBytes();
  return {ok:true,mime_type:file.getMimeType(),base64:Utilities.base64Encode(raw)};
}