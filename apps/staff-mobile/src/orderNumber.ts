/** A short display number; private order IDs remain the authoritative identity. */
export function formatOrderNumber(value?:string):string{
  if(!value)return '0000';
  const text=String(value).replace(/^#/,'').trim(),tail=text.split(/[-_]/).pop()||'';
  if(/^\d+$/.test(tail))return tail.slice(-4).padStart(4,'0');
  let hash=0;for(let i=0;i<text.length;i++)hash=(hash*31+text.charCodeAt(i))%9999;
  return String(hash+1).padStart(4,'0');
}
/** Reuse a completed reference only after every unused four-digit number is exhausted. */
export function nextOrderNumber(rows:{order_number?:string;status?:string}[]):string{
  const used=new Set(rows.map(r=>formatOrderNumber(r.order_number))),active=new Set(rows.filter(r=>!['delivered','cancelled'].includes(r.status||'')).map(r=>formatOrderNumber(r.order_number)));
  const previous=[...rows].reverse().find(r=>/^\d{4}$/.test(r.order_number||''));
  const last=Number(previous?.order_number)||0;
  for(const occupied of [used,active])for(let offset=1;offset<=9999;offset++){
    const candidate=String((last+offset-1)%9999+1).padStart(4,'0');if(!occupied.has(candidate))return candidate;
  }
  throw new Error('All four-digit order numbers are currently active. Complete an existing order before creating another.');
}
