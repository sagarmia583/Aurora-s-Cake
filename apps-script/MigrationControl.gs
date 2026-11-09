/** Honor the existing owner-controlled write freeze Script Property. */
var AURORA_MIGRATION_FROZEN_PROP_ = 'AURORA_MIGRATION_FROZEN_AT';

function auroraMigrationIso_(value) {
  if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value))return null;
  var parsed=new Date(value);return Number.isFinite(parsed.getTime())&&parsed.toISOString()===value?value:null;
}
function auroraMigrationStatus_() {
  var raw=PropertiesService.getScriptProperties().getProperty(AURORA_MIGRATION_FROZEN_PROP_);
  // Any nonempty corrupt value remains frozen. Never echo it in health output.
  return {writes_frozen:raw!==null&&raw!==undefined&&raw!=='',frozen_at:auroraMigrationIso_(raw)};
}
function auroraMigrationFrozen_() { return auroraMigrationStatus_().writes_frozen; }
function auroraMigrationAssertWritable_() {
  if(auroraMigrationFrozen_()){
    var error=new Error('Bakery updates are temporarily paused. Retry later with the same request ID.');
    error.code='migration_frozen';error.auroraMigrationFrozen=true;throw error;
  }
}
