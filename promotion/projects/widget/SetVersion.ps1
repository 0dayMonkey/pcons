$CurrentVersion = node -e "console.log(require('./package.json').version);"
Write-Output "Current Version '$CurrentVersion'"

$NewVersion = ${env:VERSION_INFO}
Write-Output "New Version $NewVersion"

(Get-Content package.json) -replace "$CurrentVersion", "$NewVersion" | Set-Content package.json
