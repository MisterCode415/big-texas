# Change to the desired directory
Set-Location -Path "C:\Users\YourUsername\sites\big-texas"

# Open new PowerShell windows and run the commands
Start-Process powershell -ArgumentList "-NoExit", "-Command", "bun run extractor.ts 51 7 0"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "bun run extractor.ts 51 8 0"
# Add more commands as needed