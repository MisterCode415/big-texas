# Install-Software.ps1

# Function to download and install software
function Install-Software {
    param (
        [string]$url,
        [string]$installerName,
        [string]$arguments = ""
    )

    # Download the installer
    $installerPath = "$env:TEMP\$installerName"
    Invoke-WebRequest -Uri $url -OutFile $installerPath

    # Execute the installer
    Start-Process -FilePath $installerPath -ArgumentList $arguments -Wait

    # Remove the installer after installation
    Remove-Item $installerPath -Force
}

# Install Node.js
Install-Software -url "https://nodejs.org/dist/v18.16.0/node-v18.16.0-x64.msi" -installerName "nodejs.msi" -arguments "/quiet"

# Install Google Chrome
Install-Software -url "https://dl.google.com/chrome/install/latest/chrome_installer.exe" -installerName "chrome_installer.exe" -arguments "/silent /install"

# Install Visual Studio Code
Install-Software -url "https://code.visualstudio.com/sha/download?build=stable&os=win32-x64-user" -installerName "VSCodeSetup.exe" -arguments "/silent"

Install-Software -url "https://github.com/git-for-windows/git/releases/download/v2.47.0.windows.2/Git-2.47.0.2-64-bit.exe" -installerName "Git-2.47.0.2-64-bit.exe" -arguments "/silent"

# Install Bun
powershell -c "irm bun.sh/install.ps1 | iex"