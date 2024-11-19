import { BlobServiceClient } from '@azure/storage-blob';
import { PDFGenerator } from './pdf-generator'; // Adjust the import path as necessary
import { argv } from 'process';
import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';

const assetTemplate = `https://reeves.tx.publicsearch.us/files/documents/%internalId%/images/%fileId%_%count%.png`

const args: any = argv.slice(2).map(arg => arg.split('='));
const _startFolder = args.find(arg => arg[0] === 'startFolder')?.[1];
const _mode = args.find(arg => arg[0] === 'mode')?.[1];
const _skipTo = args.find(arg => arg[0] === 'skipTo')?.[1];
const _startAtBase = args.find(arg => arg[0] === 'startAtBase')?.[1];
let globalCount = 0;
type Options = {
    mode: 'generate-pdfs' | 'count-docs' | 'count-by-year' | 'count-pdfs'
    skipTo?: number,
    startFolder?: string,
    startAtBase?: string,
}

async function writeFileToAzure(containerName, fileName, content) {
    const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(fileName);
    await blockBlobClient.upload(content, Buffer.byteLength(content));
    //console.log(`File ${fileName} uploaded to Azure container ${containerName}`);
}

async function downloadFiles(internalId, fileId, count) {
    const fileSet = [];
    for (let i = 1; i <= count; i++) {
        const url = assetTemplate
            .replace('%internalId%', internalId)
            .replace('%fileId%', fileId)
            .replace('%count%', i.toString());

        const savePath = `${process.env.SAVE_FOLDER}/${internalId.toString()[0]}/${internalId}/${fileId}_${i}.png`;
        fs.mkdirSync(path.dirname(savePath), { recursive: true });

        // Set headers for the request
        const headers = {
            'accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            'accept-encoding': 'gzip, deflate, br, zstd',
            'accept-language': 'en-US,en;q=0.9',
            'cache-control': 'no-cache',
            'connection': 'keep-alive',
            'cookie': '__stripe_mid=5a7e58f1-8894-45b2-829b-df6536374db6f34a71; authToken=2a8201aa-069e-4e31-97fe-76e05578a94b; authToken.sig=MpRBvKvXL6x1L_pzkgSGni-x1gw; _gid=GA1.2.1308395347.1732030397; __stripe_sid=72d9d33e-0870-4468-a635-33a7c739020e648662; _gat_gtag_UA_115781850_1=1; _ga_R8DLNV5LWZ=GS1.1.1732053648.36.1.1732053873.0.0.0; _ga=GA1.1.541308718.1730226596',
            'host': 'reeves.tx.publicsearch.us',
            'pragma': 'no-cache',
            'referer': 'https://reeves.tx.publicsearch.us/doc/100042419',
            'sec-ch-ua': '"Google Chrome";v="129", "Not=A?Brand";v="8", "Chromium";v="129"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"macOS"',
            'sec-fetch-dest': 'image',
            'sec-fetch-mode': 'no-cors',
            'sec-fetch-site': 'same-origin',
            'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36'
        };
        try {
            const response = await fetch(url, { headers });
            const buffer: Buffer = await response.buffer();
            fileSet.push(buffer);
            // fs.writeFileSync(savePath, buffer);
            await writeFileToAzure('us-leases', `C/${internalId.toString()[0]}/${internalId}/${fileId}_${i}.png`, buffer);
        } catch (error) {
            console.error(`Failed to download ${url}:`, error);
        }
        // wait 250-1250ms
        await new Promise(resolve => setTimeout(resolve, 250 + Math.random() * 200));
    }
    console.log(`Downloaded ${count} files for ${internalId} ${fileId}`);
    return fileSet;
}

async function processFolders(connectionString: string, basePath: string, startAtBase: string = 0, startFolder?: string) {
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const containerClient = blobServiceClient.getContainerClient('us-leases'); // Replace with your container name

    // Loop through integers from the starting digit to 9
    for (let i = parseInt(startAtBase); i <= 9; i++) {
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
    let pdfExists = false;
    let imageExists = false;
    let metadata = null;
    let pngBuffers: Buffer[] = [];

    // check if the PDF exists, if not loop through the blobs, get pngs and generate pdf
    const expectedPdfName = `DOC-${folderName}.pdf`; // Construct the expected PDF name
    const expectedJSONName = `${folderName}.json`;

    // check if the PDF exists
    const testBlob = containerClient.listBlobsFlat({ prefix: folderPath + expectedPdfName });
    const exists = await testBlob.next();
    pdfExists = exists.value ? true : false;
    if (pdfExists) {
        console.log(`PDF already exists in ${folderPath}. Skipping...`);
        return;
    }

    // download the json file, we need the fileId to get the first image
    const jsonBlobClient = containerClient.getBlockBlobClient(folderPath + expectedJSONName); // Get the specific blob client
    let jsonData: Buffer | null = null;

    try {
        const jsonDownloadResponse = await jsonBlobClient.download(); // Attempt to download the JSON blob
        jsonData = await streamToBuffer(jsonDownloadResponse.readableStreamBody); // Read the stream to buffer
    } catch (e) {
        console.log(`JSON not found in ${folderPath}. Skipping...`); // Handle the error if the blob does not exist
        return; // Exit the function if the JSON does not exist
    }

    if (jsonData) {
        console.log(`JSON found...`);
        metadata = JSON.parse(jsonData.toString());
        const expectedImageName = `${metadata.fileId}-1.png`

        // check if the first image exists (1+ means its valid)
        const testFirstImage = containerClient.getBlockBlobClient(folderPath + expectedImageName);
        const testFirstImageResponse = await testFirstImage.exists();
        if (testFirstImageResponse.exists) {
            imageExists = true;
        }

        // if the first image doesn't exist, download the json and get the image count
        if (!imageExists) {
            const imageCount = metadata.documentCount;
            pngBuffers = await downloadFiles(folderName, metadata.fileId, imageCount);
        }

        // only make it here if the first image exists
        if (pngBuffers.length > 0) {
            console.log(`Generating PDF from PNGs...`);
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

async function countByYear(containerClient: any, databaseClient: MongoClient, basePath: string, options: Options): Promise<Map<string, number> | null> {
    const blobs = containerClient.listBlobsFlat({ prefix: basePath + (options.startFolder || '') });
    const datesToYears = new Map<string, number>();
    let i = 1;
    for await (const blob of blobs) {
        if (blob.name.endsWith('.json')) {
            globalCount++;
            if (globalCount < (options.skipTo || 0)) {
                if (globalCount % 100 === 0) {
                    console.log(`Skipping ${globalCount} because it is less than ${options.skipTo}`);
                }
                continue;
            }
            const blobClient = containerClient.getBlobClient(blob.name);
            const blobParts = blob.name.split('/');
            const folder = blobParts[blobParts.length - 2];
            const downloadResponse = await blobClient.download();
            const jsonData = await streamToBuffer(downloadResponse.readableStreamBody);
            const metaBlock = JSON.parse(jsonData.toString());
            delete metaBlock._id;
            // write to mongodb
            const database = databaseClient.db('big-texas');
            const collection = database.collection('leases-meta');
            let hash = metaBlock.instrumentDate.split('/');
            hash = hash[2] + '-' + hash[0] + '-' + hash[1];
            const receipt = await collection.updateOne({
                fileId: metaBlock.fileId, internalId: folder
            }, {
                $set: {
                    ...metaBlock,
                    instrumentDate: hash
                }
            }, {
                upsert: true
            });
            if (receipt.upsertedId) {
                if (datesToYears.has(hash)) {
                    datesToYears.set(hash, datesToYears.get(hash) + 1);
                } else {
                    datesToYears.set(hash, 1);
                }
            }
            i++;
            if (i % 20 === 0) {
                console.log(`Processed ${i} files`);
            }
        }
    }
    return datesToYears;
}

// Example usage
const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING; // Replace with your Azure Storage connection string
const basePath = 'texas/reeves/'; // Base path to start processing
let startFolder = process.argv[2];
let hasSkipped = false;

const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
const containerClient = blobServiceClient.getContainerClient('us-leases'); // Replace with your container name

async function main(options: Options) {
    switch (options.mode) {
        case 'generate-pdfs':
            processFolders(connectionString, basePath, options.startAtBase, options.startFolder).catch(console.error);
            break;
        case 'count-docs':
            countDocs(containerClient, basePath).then(count => {
                console.log(`Total number of Docs: ${count}`);
            }).catch(console.error);
            break;
        case 'count-pdfs':
            countPDFs(containerClient, basePath).then(count => {
                console.log(`Total number of PDFs: ${count}`);
            }).catch(console.error);
            break;
        case 'count-by-year':
            const databaseClient = new MongoClient(process.env.MONGODB_URI);
            for (let i = 1; i <= 9; i++) {
                await countByYear(containerClient, databaseClient, `${basePath}${i}/`, options).then(countStats => {
                    console.log(`Total number of Docs by Year: `, countStats);
                }).catch(console.error);
            }
            databaseClient.close();
            break;
        default:
            throw new Error('Invalid mode');
    }
}

const options = { startFolder: _startFolder || null, mode: _mode, skipTo: _skipTo || null, startFolder: _startFolder || null, startAtBase: _startAtBase || null }
main(options).catch(console.error);