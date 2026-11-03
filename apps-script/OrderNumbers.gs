function auroraFormatOrderNumber_(value){
  if(!value)return '0000';
  var text=String(value).replace(/^#/,'').trim(),parts=text.split(/[-_]/),tail=parts[parts.length-1]||'';
  if(/^\d+$/.test(tail))return tail.slice(-4).padStart(4,'0');
  var hash=0;for(var i=0;i<text.length;i++)hash=(hash*31+text.charCodeAt(i))%9999;
  return String(hash+1).padStart(4,'0');
}
/** Called inside the existing checkout lock, after idempotent retry lookup. */
function auroraNextOrderNumber_(rows){
  var used={},active={},last=0;
  rows.forEach(function(row){var number=auroraFormatOrderNumber_(row.order_number);used[number]=true;if(['delivered','cancelled'].indexOf(String(row.status))===-1)active[number]=true;if(/^\d{4}$/.test(String(row.order_number||'')))last=Number(row.order_number);});
  var sets=[used,active];
  for(var pass=0;pass<sets.length;pass++)for(var offset=1;offset<=9999;offset++){
    var candidate=String((last+offset-1)%9999+1).padStart(4,'0');if(!sets[pass][candidate])return candidate;
  }
  auroraReject_('order_number_capacity','All four-digit order numbers are active. Complete an existing order before creating another.');
}
