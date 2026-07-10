import { Howl, Howler } from 'howler';

function tone(frequency=440,duration=.09,noise=0){const rate=11025,length=Math.floor(rate*duration),buffer=new ArrayBuffer(44+length*2),view=new DataView(buffer);const str=(o,s)=>[...s].forEach((c,i)=>view.setUint8(o+i,c.charCodeAt(0)));str(0,'RIFF');view.setUint32(4,36+length*2,true);str(8,'WAVEfmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);str(36,'data');view.setUint32(40,length*2,true);for(let i=0;i<length;i++){const t=i/rate,fade=Math.pow(1-i/length,2),sample=(Math.sin(t*frequency*Math.PI*2)*(1-noise)+(Math.random()*2-1)*noise)*fade;view.setInt16(44+i*2,sample*32767,true)}let binary='';for(const b of new Uint8Array(buffer))binary+=String.fromCharCode(b);return `data:audio/wav;base64,${btoa(binary)}`}

export class AudioSystem{
  constructor(volume=.55){Howler.volume(volume);this.sounds={shoot:new Howl({src:[tone(180,.065,.45)],volume:.35}),explosion:new Howl({src:[tone(70,.35,.78)],volume:.7}),pickup:new Howl({src:[tone(660,.12,.05)],volume:.45}),build:new Howl({src:[tone(340,.35,.12)],volume:.6}),hurt:new Howl({src:[tone(95,.18,.5)],volume:.5})}}
  play(name,rate=1){const sound=this.sounds[name];if(sound){const id=sound.play();sound.rate(rate,id)}}setVolume(v){Howler.volume(v)}
}
