import fs from 'node:fs';
// Original three-note bell. No licensed recording or network resource required.
const rate=22050,seconds=2.7,count=Math.ceil(rate*seconds),wav=Buffer.alloc(44+count*2);
wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(count*2,40);
for(let i=0;i<count;i++){
  const time=i/rate;let sample=0;
  for(const [start,freq] of [[0,659.25],[0.3,830.61],[0.62,987.77]]){
    const t=time-start;if(t<0)continue;
    const envelope=Math.min(1,t/0.012)*Math.exp(-3.3*t);
    sample+=envelope*(Math.sin(2*Math.PI*freq*t)+0.23*Math.sin(4*Math.PI*freq*t))/3;
  }
  sample*=Math.min(1,(seconds-time)/0.15);
  wav.writeInt16LE(Math.round(Math.max(-1,Math.min(1,sample))*26000),44+i*2);
}
fs.writeFileSync('apps/staff-mobile/assets/aurora_chime_v2.wav',wav);
console.log('Created original Aurora chime:',wav.length,'bytes');
