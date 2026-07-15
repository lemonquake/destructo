import { defineConfig, loadEnv } from 'vite';
import { handlePayPalRequest } from './server/paypal.js';

export default defineConfig(({mode})=>{const env={...process.env,...loadEnv(mode,process.cwd(),'')};return{plugins:[{name:'destructo-paypal-api',configureServer(server){server.middlewares.use(async(req,res,next)=>{if(!await handlePayPalRequest(req,res,env))next()})}}]}});

