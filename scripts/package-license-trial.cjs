const fs=require('fs'),path=require('path'),crypto=require('crypto')
const root=path.resolve(__dirname,'..'),asar=require('@electron/asar')
async function main(){
  const installed=process.argv[2],target=process.argv[3],privateDir=process.argv[4]
  if(!installed||!target||!privateDir||![installed,target,privateDir].every(path.isAbsolute))throw new Error('Provide absolute installed, fresh target and private-data paths')
  if(fs.existsSync(target))throw new Error('Trial target already exists; use a new directory')
  const config=JSON.parse(fs.readFileSync(path.join(privateDir,'client-config.json'),'utf8'))
  const cloud=process.argv.includes('--cloud')
  if(cloud){if(config.trial||new URL(config.serverUrl).protocol!=='https:')throw new Error('Expected a deployed HTTPS cloud service');config.preview=true}
  else if(config.trial!==true||new URL(config.serverUrl).hostname!=='127.0.0.1')throw new Error('Expected a loopback trial configuration')
  fs.mkdirSync(target,{recursive:true})
  for(const file of fs.readdirSync(installed)){if(file==='resources'||file.startsWith('Uninstall'))continue;fs.cpSync(path.join(installed,file),path.join(target,file),{recursive:true})}
  const resources=path.join(target,'resources');fs.mkdirSync(resources)
  const stage=path.join(target,'package-source');fs.mkdirSync(stage)
  asar.extractAll(path.join(installed,'resources/app.asar'),stage)
  fs.rmSync(path.join(stage,'dist'),{recursive:true,force:true});fs.cpSync(path.join(root,'dist'),path.join(stage,'dist'),{recursive:true})
  for(const file of fs.readdirSync(path.join(root,'electron')).filter(f=>f.endsWith('.cjs')))fs.copyFileSync(path.join(root,'electron',file),path.join(stage,'electron',file))
  fs.writeFileSync(path.join(stage,'electron/license-config.cjs'),'module.exports = '+JSON.stringify(config,null,2))
  const pkg=JSON.parse(fs.readFileSync(path.join(stage,'package.json'),'utf8'));pkg.version=cloud?'0.3.24-cloud-preview':'0.3.24-license-trial';pkg.description=cloud?'芜湖AI 云端授权验证':'芜湖AI 本地授权试用';fs.writeFileSync(path.join(stage,'package.json'),JSON.stringify(pkg,null,2))
  const output=path.join(resources,'app.asar');await asar.createPackageWithOptions(stage,output,{unpack:'**/ffmpeg-static/ffmpeg{,.exe}'})
  const files=asar.listPackage(output)
  if(files.some(f=>f.includes('license-server')||f.includes('signing-private')||f.includes('admin-login')||f.includes('licenses.json')))throw new Error('Server-side secrets must not enter the client archive')
  const executable=path.join(target,cloud?'芜湖AI云端授权.exe':'芜湖AI授权试用.exe')
  fs.renameSync(path.join(target,'芜湖AI.exe'),executable)
  const manifest={directory:target,executable,sha256:crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex'),version:pkg.version,serverUrl:config.serverUrl,createdAt:new Date().toISOString()}
  fs.writeFileSync(path.join(target,'trial-build.json'),JSON.stringify(manifest,null,2));console.log(JSON.stringify(manifest,null,2))
}
main().catch(e=>{console.error(e.message);process.exitCode=1})
