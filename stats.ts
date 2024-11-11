// Import necessary Azure Storage libraries
import { BlobServiceClient } from '@azure/storage-blob';
async function main() {
    async function countPDFs(connectionString: string, basePath: string, depth: number) {
        const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
        const containerClient = blobServiceClient.getContainerClient('us-leases'); // Replace with your container name

        let pdfCount = 0;

        // Function to recursively count PDFs
        async function countItems(currentPath: string, currentDepth: number) {
            if (currentDepth > depth) return;

            const blobs = containerClient.listBlobsFlat({ prefix: currentPath });

            for await (const blob of blobs) {
                if (blob.name.endsWith('.pdf')) {
                    // Count PDFs
                    pdfCount++;
                }
            }
        }

        await countItems(basePath, 1); // Start counting from the base path
        return pdfCount; // Return the count of PDFs
    }
    async function countFoldersAndPDFs(connectionString: string, basePath: string, depth: number) {
        const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
        const containerClient = blobServiceClient.getContainerClient('us-leases'); // Replace with your container name

        let folderCount = 0;
        let pdfCount = 0;

        // Function to recursively count folders and PDFs
        async function countItems(currentPath: string, currentDepth: number) {
            if (currentDepth > depth) return;

            const folderClient = containerClient.getBlobClient(currentPath);
            const blobs = containerClient.listBlobsFlat({ prefix: currentPath });

            for await (const blob of blobs) {
                const parts = blob.name.split('/');
                if (parts.length === currentDepth + 1) {
                    // Count folders
                    folderCount++;
                }
                if (blob.name.endsWith('.pdf') && parts.length === currentDepth + 1) {
                    // Count PDFs
                    pdfCount++;
                }
            }

            // Recursively check for subfolders
            for await (const blob of blobs) {
                const parts = blob.name.split('/');
                if (parts.length === currentDepth + 1) {
                    await countItems(blob.name, currentDepth + 1);
                }
            }
        }

        await countItems(basePath, 1); // Start counting from the base path

        console.log(`Total folders at depth ${depth}: ${folderCount}`);
        console.log(`Total PDFs in child folders: ${pdfCount}`);
    }

    // Example usage
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING; // Replace with your Azure Storage connection string
    const basePath = 'texas/reeves/'; // Base path to start counting
    const depth = 1; // Depth to count folders
    let totalPdfCount = 0; // Initialize total PDF count

    // // Loop through integers 1 to 9
    // for (let i = 1; i <= 9; i++) {
    //     const dynamicBasePath = `${basePath}${i}/`; // Construct the path for each integer
    //     const pdfCount = await countPDFs(connectionString, dynamicBasePath, depth).catch(console.error);
    //     totalPdfCount += pdfCount || 0; // Accumulate the total PDF count
    // }
    const dynamicBasePath = `${basePath}4/`; // Construct the path for each integer
    const pdfCount = await countPDFs(connectionString, dynamicBasePath, depth).catch(console.error);
    totalPdfCount += pdfCount || 0; // Accumulate the total PDF count

    console.log(`Total PDFs in child folders: ${totalPdfCount}`);
}

main(); 