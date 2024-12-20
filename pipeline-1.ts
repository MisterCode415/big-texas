import { BlobServiceClient } from '@azure/storage-blob';
import { AzureKeyCredential } from "@azure/core-auth";
import DocumentIntelligence from "@azure-rest/ai-document-intelligence";
import {
    getLongRunningPoller,
    AnalyzeResultOperationOutput,
    isUnexpected,
} from "@azure-rest/ai-document-intelligence";
const { setLogLevel } = require("@azure/logger");
setLogLevel("info");
import dotenv from 'dotenv';
import fs from 'fs';
import { MongoClient } from 'mongodb';
dotenv.config();

// get arguments
const args = process.argv;
const batchSize = args.find(arg => arg.startsWith('limit='))?.split('=')[1] || '10';
const offset = args.find(arg => arg.startsWith('offset='))?.split('=')[1] || '0';

//use your `key` and `endpoint` environment variables
const apiKey = process.env['DI_KEY'];
const endpoint = process.env['DI_ENDPOINT'];

// sample document
// const documentUrlRead = "https://bigtexas.blob.core.windows.net/us-leases/texas/reeves/1/100042419/DOC-100042419.pdf"

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

async function main(options: { batchSize: string, offset: string }) {
    console.log('starting...');
    const mongoClient = new MongoClient(process.env.MONGODB_URI);
    await mongoClient.connect();
    const db = mongoClient.db('big-texas');
    const AZURE_STORAGE_CONNECTION_STRING: string = process.env.AZURE_STORAGE_CONNECTION_STRING;
    if (!AZURE_STORAGE_CONNECTION_STRING) {
        throw new Error('AZURE_STORAGE_CONNECTION_STRING is not set');
    }
    const cursor = db
        .collection('leases-meta')
        .find({ text: { $eq: null } })
        .skip(parseInt(options.offset))
        .limit(parseInt(options.batchSize));
    for await (const lease of cursor) {
        const internalId = lease.internalId;
        const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
        const containerClient = blobServiceClient.getContainerClient('us-leases');
        let blockBlobClient = containerClient.getBlockBlobClient("texas/reeves/1/" + internalId + "/DOC-" + internalId + ".pdf");
        const pdfDataStream = await blockBlobClient.download();
        const pdfData = await streamToBuffer(pdfDataStream.readableStreamBody);
        console.log('AI analysis in progress: ', internalId);
        const client = DocumentIntelligence(endpoint, new AzureKeyCredential(apiKey));
        const initialResponse = await client
            .path("/documentModels/{modelId}:analyze", "prebuilt-layout")
            .post({
                contentType: "application/json",
                body: {
                    base64Source: pdfData.toString('base64'),
                },
                headers: {
                    "x-ms-lease-id": "c30d315d-95db-4fc5-b2b7-5a330265702f"
                },
                queryParameters: { outputContentFormat: "text" },
            });


        // save to disk
        if (isUnexpected(initialResponse)) {
            throw initialResponse.body.error;
        }
        console.log('initialized, here is the transaction id: ', initialResponse);
        const results: any = await pollUntilDone(client, initialResponse as unknown as AnalyzeResultOperationOutput);
        console.log('result: ', results);

        // save to blob
        blockBlobClient = containerClient.getBlockBlobClient('texas/reeves/1/' + internalId + '/' + internalId + '-analysis.json');
        await blockBlobClient.upload(JSON.stringify(results, null, 2), Buffer.byteLength(JSON.stringify(results, null, 2)));
        // save text only, to store

        const collection = db.collection('leases-meta');
        try {
            const textResult = results[0].result.body.analyzeResult.content;
            const updateResult = await collection.updateOne({ internalId: internalId }, { $set: { text: textResult } }, { upsert: false });
            console.log('updateResult: ', updateResult);
        } catch (error) {
            console.error('error, skipping mongo update: ', error);
        }
        console.log('finished: ', internalId);
    }
    await mongoClient.close();
}

async function pollUntilDone(client, initialResponse: AnalyzeResultOperationOutput) {
    // start poller with transaction id
    const results: any = [];
    // @ts-ignore
    const poller = await getLongRunningPoller(client, initialResponse as unknown as AnalyzeResultOperationOutput);
    while (!poller.isDone()) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const result = await poller.poll();
        console.log('result: ', result);
        results.push(result);
    }
    return results;
}


main({
    batchSize: batchSize,
    offset: offset
}).catch((error) => {
    console.error("An error occurred:", error);
    process.exit(1);
});