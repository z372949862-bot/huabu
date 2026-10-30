const fs=require('fs'),path=require('path'),crypto=require('crypto')
async function main(){
 const directory=process.argv[2],account=process.argv[3],database=process.argv[4]
 if(!directory||!path.isAbsolute(directory)||!account||!database)throw new Error('Provide absolute private directory, account id and database id')
 const authPath=path.join(process.env.APPDATA,'xdg.config/.wrangler/config/default.toml')
 const token=fs.readFileSync(authPath,'utf8').match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1]
 if(!token)throw new Error('Run wrangler login first')
 const call=async(method,route,body)=>{const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+route,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const data=await r.json();if(!data.success)throw new Error('Cloudflare API '+r.status+' '+JSON.stringify(data.errors));return data.result}
 let subdomain
 try{subdomain=await call('GET','/workers/subdomain')}catch(error){if(!error.message.includes('10007'))throw error}
 if(!subdomain?.subdomain)subdomain=await call('PUT','/workers/subdomain',{subdomain:'wuhu-ai-'+account.slice(0,8)})
 const origin='https://wuhu-ai-license.'+subdomain.subdomain+'.workers.dev'
 fs.mkdirSync(directory,{recursive:true})
 const keyPath=path.join(directory,'signing-private.pem'),loginPath=path.join(directory,'admin-login.txt')
 if(!fs.existsSync(keyPath)){const key=crypto.generateKeyPairSync('ed25519');fs.writeFileSync(keyPath,key.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600})}
 if(!fs.existsSync(loginPath))fs.writeFileSync(loginPath,crypto.randomBytes(32).toString('base64url'),{mode:0o600})
 const privateKey=fs.readFileSync(keyPath,'utf8'),publicKey=crypto.createPublicKey(privateKey).export({type:'spki',format:'pem'})
 fs.writeFileSync(path.join(directory,'deploy.secrets.json'),JSON.stringify({SIGNING_PRIVATE_KEY:privateKey,PUBLIC_KEY:publicKey,ADMIN_PASSWORD_HASH:crypto.createHash('sha256').update(fs.readFileSync(loginPath,'utf8').trim()).digest('hex')}),{mode:0o600})
 const config=JSON.parse(fs.readFileSync(path.join(__dirname,'wrangler.jsonc'),'utf8'))
 config.account_id=account;config.d1_databases[0].database_id=database;config.vars.PUBLIC_ORIGIN=origin
 fs.writeFileSync(path.join(__dirname,'wrangler.jsonc'),JSON.stringify(config,null,2)+'\n')
 fs.writeFileSync(path.join(directory,'client-config.json'),JSON.stringify({required:true,trial:false,serverUrl:origin,publicKey,heartbeatSeconds:300},null,2))
 fs.writeFileSync(path.join(directory,'deployment.json'),JSON.stringify({accountId:account,databaseId:database,origin,createdAt:new Date().toISOString()},null,2))
 console.log(JSON.stringify({origin,privateDirectory:directory,publicKeyFingerprint:crypto.createHash('sha256').update(publicKey).digest('hex')}))
}
main().catch(e=>{console.error(e.message);process.exitCode=1})
