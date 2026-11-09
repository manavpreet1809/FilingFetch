import 'dotenv/config';
import { access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const required=['GOOGLE_CLOUD_PROJECT','AGENT_EMAIL','DATABASE_URL','OPENAI_API_KEY'];
const missing=required.filter(name=>!process.env[name]);
for(const [name,path] of [['GOOGLE_OAUTH_CREDENTIALS_PATH',process.env.GOOGLE_OAUTH_CREDENTIALS_PATH??'secrets/google-oauth.json'],['GOOGLE_OAUTH_TOKEN_PATH',process.env.GOOGLE_OAUTH_TOKEN_PATH??'secrets/google-token.json']]){
 try{await access(path);}catch{missing.push(name);}
}
const cli=process.env.GCLOUD??'gcloud';const result=spawnSync(cli,['version'],{stdio:'ignore'});
if(result.status!==0)missing.push('GCLOUD');
console.log(JSON.stringify({readyForLocalSecretProvisioning:missing.length===0,missing},null,2));
if(missing.length)process.exitCode=1;
