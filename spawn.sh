cd ~/sites/big-texas

# Open new terminal windows and run the commands
gnome-terminal -- bash -c "bun run extractor.ts 51 7 0; exec bash"
gnome-terminal -- bash -c "bun run extractor.ts 51 8 0; exec bash"
