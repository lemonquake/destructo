import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { handlePayPalRequest } from './paypal.js';
import { loadEnvFile } from './loadEnv.js';

loadEnvFile();
const port=Number(process.env.PORT||4173),root=join(process.cwd(),'dist'),types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webp':'image/webp','.mp3':'audio/mpeg','.wav':'audio/wav','.json':'application/json; charset=utf-8'};
const server=http.createServer(async(req,res)=>{if(await handlePayPalRequest(req,res))return;const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),candidate=normalize(join(root,pathname==='/'?'index.html':pathname));let file=candidate.startsWith(root)&&existsSync(candidate)&&statSync(candidate).isFile()?candidate:join(root,'index.html');res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' https://www.paypal.com https://www.sandbox.paypal.com; frame-src https://www.paypal.com https://www.sandbox.paypal.com; connect-src 'self' https://www.paypal.com https://www.sandbox.paypal.com https://api-m.paypal.com https://api-m.sandbox.paypal.com; img-src 'self' data: https://*.paypal.com; style-src 'self' 'unsafe-inline'; media-src 'self';");createReadStream(file).pipe(res)});
server.listen(port,()=>console.log(`Destructo server ready at http://localhost:${port}`));
