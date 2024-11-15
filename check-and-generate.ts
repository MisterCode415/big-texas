import { BlobServiceClient } from '@azure/storage-blob';
import { PDFGenerator } from './pdf-generator'; // Adjust the import path as necessary

async function processFolders(connectionString: string, basePath: string, startFolder?: string) {
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const containerClient = blobServiceClient.getContainerClient('us-leases'); // Replace with your container name

    // Determine the starting digit from the startFolder parameter
    const startDigit = startFolder ? parseInt(startFolder.charAt(0), 10) : 1;

    // Loop through integers from the starting digit to 9
    for (let i = startDigit; i <= 9; i++) {
        const dynamicBasePath = `${basePath}${i}/`; // Construct the path for each integer
        await checkSubFolders(dynamicBasePath, containerClient, startFolder);
    }
}

async function streamToBuffer(readableStream: NodeJS.ReadableStream | undefined): Promise<Buffer> {
    if (!readableStream) {
        throw new Error('Readable stream is undefined');
    }
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        readableStream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        readableStream.on('error', reject);
        readableStream.on('end', () => resolve(Buffer.concat(chunks)));
    });
}

async function checkSubFolders(basePath: string, containerClient: any, startFolder?: string) {
    const blobs = containerClient.listBlobsByHierarchy('/', { prefix: basePath });
    let startProcessing = !startFolder; // Determine if we should start processing immediately

    for await (const blob of blobs) {
        const parts = blob.name.split('/');
        if (parts.length === 5) { // Adjust this based on your folder structure
            const folderName = parts[parts.length - 2]; // Get the last folder name (e.g., 56824375)
            const folderPath = `${basePath}${folderName}/`; // Construct the full path to the subfolder

            if (startFolder && folderName !== startFolder) {
                continue; // Skip to the next folder
            } else if (startFolder) {
                hasSkipped = true;
                startFolder = undefined;
                console.log(`Starting at ${folderName}`);
            }

            startProcessing = true;
            await checkAndGeneratePDF(folderPath, containerClient, folderName);
        }
    }
}

async function checkAndGeneratePDF(folderPath: string, containerClient: any, folderName: string) {
    const pngBuffers: Buffer[] = [];
    const expectedPdfName = `DOC-${folderName}.pdf`; // Construct the expected PDF name

    // check if the PDF exists, if not loop through the blobs, get pngs and generate pdf
    let pdfExists = false;
    const testBlob = containerClient.listBlobsFlat({ prefix: folderPath + expectedPdfName });
    for await (const blob of testBlob) {
        if (blob.name.endsWith(expectedPdfName)) {
            pdfExists = true;
            break;
        }
    }

    if (!pdfExists) {
        // Check for existing PDFs and collect PNGs
        const blobs = containerClient.listBlobsFlat({ prefix: folderPath });
        for await (const blob of blobs) {
            if (blob.name.endsWith(expectedPdfName)) {
                console.log(`.`)
                return;
            } else if (blob.name.endsWith('.png')) {
                // Download the PNG blob data
                const blockBlobClient = containerClient.getBlockBlobClient(blob.name);
                const downloadResponse = await blockBlobClient.download(0);
                const downloadedData = await streamToBuffer(downloadResponse.readableStreamBody);
                pngBuffers.push(downloadedData); // Collect PNG byte arrays
            }
        }

        // If no PDF found, generate and upload PDF
        if (pngBuffers.length > 0) {
            console.log(`No PDF found in ${folderPath}. Generating PDF from PNGs...`);
            const pdfBuffer = await new PDFGenerator().generatePDF(folderPath, pngBuffers);
            const pdfFileName = `${folderPath}${expectedPdfName}`; // Construct PDF file name

            // Upload the generated PDF
            const blockBlobClient = containerClient.getBlockBlobClient(pdfFileName);
            await blockBlobClient.upload(pdfBuffer, Buffer.byteLength(pdfBuffer));
            console.log(`Uploaded PDF: ${pdfFileName}`);
        } else {
            console.log(`No PNGs found in ${folderPath}. Skipping...`);
        }
    }
}

async function countDocs(containerClient: any, basePath: string): Promise<number> {
    let documentCount = 0;
    for (let i = 1; i <= 9; i++) {
        const blobs = containerClient.listBlobsByHierarchy('/', { prefix: `${basePath}${i}/` });
        for await (const blob of blobs) {
            console.log(blob.name);
            documentCount++;
        }
    }
    return documentCount;
}

async function countPDFs(containerClient: any, basePath: string): Promise<number> {
    let pdfCount = 0;
    const blobs = containerClient.listBlobsFlat({ prefix: basePath });

    for await (const blob of blobs) {
        if (blob.name.endsWith('.pdf')) {
            pdfCount++;
            console.log(pdfCount, blob.name);
        }
    }

    return pdfCount;
}

// Example usage
const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING; // Replace with your Azure Storage connection string
const basePath = 'texas/reeves/'; // Base path to start processing
let startFolder = process.argv[2];
let hasSkipped = false;

const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
const containerClient = blobServiceClient.getContainerClient('us-leases'); // Replace with your container name

countDocs(containerClient, basePath).then(count => {
    console.log(`Total number of Docs: ${count}`);
}).catch(console.error);
// countPDFs(containerClient, basePath).then(count => {
//     console.log(`Total number of PDFs: ${count}`);
// }).catch(console.error);
//processFolders(connectionString, basePath, startFolder).catch(console.error);