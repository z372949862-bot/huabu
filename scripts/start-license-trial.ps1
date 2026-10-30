param([switch]$OpenAdmin)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$privateDir='F:/WuhuAI/license-trial-private'
$exe='F:/WuhuAI/license-trial-v1/芜湖AI授权试用.exe'
$origin='http://127.0.0.1:18765'
$health=$null
try{$health=Invoke-RestMethod ($origin+'/health') -TimeoutSec 2}catch{}
if(!$health){
  $node=(Get-Command node.exe).Source
  $server=Start-Process -FilePath $node -ArgumentList @((Join-Path $root 'license-server/server.cjs'),$privateDir,'18765') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $privateDir 'server.stdout.log') -RedirectStandardError (Join-Path $privateDir 'server.stderr.log')
  $server.Id|Set-Content (Join-Path $privateDir 'server.pid')
  for($i=0;$i -lt 20;$i++){Start-Sleep -Milliseconds 250;try{$health=Invoke-RestMethod ($origin+'/health') -TimeoutSec 1;break}catch{}}
}
if(!$health.ok -or $health.service -ne 'wuhu-license-local-trial'){throw '本地授权服务没有成功启动，请检查私有目录中的服务日志'}
if($OpenAdmin){Start-Process ($origin+'/admin');Start-Process -FilePath 'notepad.exe' -ArgumentList @((Join-Path $privateDir 'admin-login.txt'))}
else{Start-Process -FilePath $exe}
