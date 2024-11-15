import { BlobServiceClient } from '@azure/storage-blob';
import crawlUrls from './generated-urls.json';
import fetch from 'node-fetch';
import { argv } from 'process';
import { By, Builder, Browser, until } from 'selenium-webdriver';
import { MongoClient } from 'mongodb';
import leaseFilterConfig from './document-types.json';
import allFiltersConfig from './flat-codes.json';
import fs from 'fs';
import path from 'path';
import countyCodes from './county-codes.json';
import { PDFGenerator } from './pdf-generator';
const dotenv = require('dotenv');
dotenv.config();

const args: any = argv.slice(2).map(arg => arg.split('='));
if (args.length < 4) {
    throw new Error('Missing arguments: startYear, startMonth, endYear, endMonth');
}
const _startYear = parseInt(args.find(arg => arg[0] === 'startYear')?.[1]);
const _startMonth = parseInt(args.find(arg => arg[0] === 'startMonth')?.[1]);
const _endYear = parseInt(args.find(arg => arg[0] === 'endYear')?.[1]);
const _endMonth = parseInt(args.find(arg => arg[0] === 'endMonth')?.[1]);
const _offsetOverride = args.find(arg => arg[0] === 'offsetOverride')?.[1];
const _itemOnPageOverride = args.find(arg => arg[0] === 'itemOnPageOverride')?.[1];
const _offsetOverrideEnd = args.find(arg => arg[0] === 'offsetOverrideEnd')?.[1];
const _itemOnPageOverrideEnd = args.find(arg => arg[0] === 'itemOnPageOverrideEnd')?.[1];

if (!_startYear || !_startMonth || !_endYear || !_endMonth) {
    throw new Error('Missing arguments: startYear, startMonth, endYear, endMonth');
}

(async function main({
    offsetOverride,
    itemOnPageOverride,
    offsetOverrideEnd,
    itemOnPageOverrideEnd,
    startYear,
    startMonth,
    endYear,
    endMonth
}: any) {
    offsetOverride = determine(offsetOverride)
    itemOnPageOverride = determine(itemOnPageOverride)
    offsetOverrideEnd = determine(offsetOverrideEnd)
    itemOnPageOverrideEnd = determine(itemOnPageOverrideEnd)

    let db;
    let blobServiceClient;
    let curPage = null;
    let curPageExtractor = 0;
    let driver: any;
    let maxResults: number | null = null;
    let maxResultsExtractor: number | null = null;
    let totalPages: number | null = null;
    let totalPagesExtractor: number | null = null;
    let currentFilter: string | null = null;
    const pageSize = 250;
    let collection: any = null;
    const assetTemplate = `https://reeves.tx.publicsearch.us/files/documents/%internalId%/images/%fileId%_%count%.png`

    function determine(argument) {
        return parseInt(argument as string) >= 0 ? parseInt(argument as string) : null;
    }

    async function stepScrollFromBottom() {
        const steps = await driver.executeScript('return Math.ceil(document.body.scrollHeight / window.innerHeight)');
        const stepHeight = await driver.executeScript('return window.innerHeight');
        console.log(`steps: `, steps, `stepHeight: `, stepHeight);
        for (let i = steps; i > 0; i--) {
            const nextStep = i * stepHeight;
            await driver.executeScript(`window.scrollTo({left:0, top:${nextStep}, behavior:"smooth"});`);
            await driver.sleep(1000 + Math.random() * 1000);
        }
    }

    async function scrollUpAndDown() {
        await driver.executeScript(`window.scrollTo({left:0, top:0, behavior:"smooth"});`);
        await driver.sleep(1000 + Math.random() * 1000);
        await driver.executeScript(`window.scrollTo({left:0, top:document.body.scrollHeight/2, behavior:"smooth"});`);
        await driver.sleep(1000 + Math.random() * 1000);
        await driver.executeScript(`window.scrollTo({left:0, top:document.body.scrollHeight, behavior:"smooth"});`);
        await driver.sleep(1000 + Math.random() * 1000);
        await driver.executeScript(`window.scrollTo({left:0, top:document.body.scrollHeight/2, behavior:"smooth"});`);
        await driver.sleep(1000 + Math.random() * 1000);
        await driver.executeScript(`window.scrollTo({left:0, top:0, behavior:"smooth"});`);
    }

    function formatDate(year, month) {
        return `${year}${String(month).padStart(2, '0')}01`;
    }

    async function iterateThroughMonths() {
        const targetUrl = "https://reeves.tx.publicsearch.us/results";
        const targetDepartment = "RP";
        const limit = 250;

        for (let year = startYear; year <= endYear; year++) {
            for (let month = 1; month <= 12; month++) {
                if (year === endYear && month > endMonth) {
                    break; // Stop if we reach the end month of the end year
                }

                const startDate = formatDate(year, month);
                const nextMonth = month === 12 ? 1 : month + 1; // Reset to January if December
                const nextYear = month === 12 ? year + 1 : year; // Increment year if December
                const endDate = formatDate(nextYear, nextMonth); // Correctly format the end date
                const targetDateRange = `${startDate},${endDate}`;

                const url = `${targetUrl}?department=${targetDepartment}&limit=${limit}&recordedDateRange=${targetDateRange}&searchOcrText=false&searchType=quickSearch&viewType=card`;
                console.log(`Processing URL: ${url}`);
                await pageExtractor(url);
                offsetOverride = 0; // reset for rest of list
                // Here you would call your page extraction logic similar to extractor.ts
                // await pageExtractor(url);
            }
        }
    }

    async function pageExtractor(url) {
        await driver.sleep(2000 + Math.random() * 1000);

        // get crawl stats from first page
        // const nextUrl = url + '&offset=' + offsetOverride !== null ? offsetOverride : '0';
        const nextUrl = `${url}&offset=${offsetOverride !== null ? offsetOverride : '0'}`;
        await driver.get(nextUrl, { timeout: 60000 }); // first 
        await driver.executeScript('document.body.style.zoom = "50%"');
        const totalResultsSelector = `[data-testid="resultsSummary"] > span:nth-of-type(1)`;
        let maxResultsText;
        try {
            await driver.wait(until.elementLocated(By.css(totalResultsSelector)), 10000);
            maxResultsText = await driver.findElement(By.css(totalResultsSelector)).getText();
        } catch (error) {
            console.error('NO DATA ON THIS PAGE...', error, url + '&offset=0');
            return;
        }
        // we want max results from page 1 either way...
        maxResultsExtractor = parseInt(maxResultsText.split('of')[1].split('results')[0].replace(/,/g, '').trim());
        totalPagesExtractor = Math.ceil(maxResultsExtractor / pageSize);
        curPageExtractor = offsetOverride || curPageExtractor; // either override or start at 0
        // once this is set kill the offsetOverride
        offsetOverride = null;

        // check if we need to go to the next page, and if we are at the end of the override range
        if (hasNextPageExtractor()) {
            curPageExtractor++;
            await driver.sleep(2000 + Math.random() * 1000);
            await getNextPageExtractor(url, curPageExtractor);
            if (itemOnPageOverrideEnd && curPageExtractor === itemOnPageOverrideEnd) { // are we supposed to stop at a specific page?
                console.log(`stopping at override page :: `, curPageExtractor);
                // kill the itemOnPageOverrideEnd
                itemOnPageOverrideEnd = null; // if we dont it will only start here on every pagination
                return;
            } else {
                console.log(`next page :: `, curPageExtractor);
                return await pageExtractor(url);
            }
        } else {
            console.log("no more pages for this extractor");
            console.log(`for ${curPageExtractor} -> total pages: `, totalPagesExtractor, `current page: `, curPageExtractor);
            // reset curPageExtractor
            curPageExtractor = 0;
            return;
        }
    }

    async function getNextPageExtractor(url, page) {
        await driver.sleep(2000 + Math.random() * 1000);
        if (curPageExtractor > 1) {
            await driver.get(url + '&offset=' + ((page - 1) * pageSize).toString(), { timeout: 10000 });
        }
        const itemCardsSelector = `.result-card`
        await driver.wait(until.elementLocated(By.css(itemCardsSelector)), 10000);

        // await stepScrollFromBottom();
        await scrollUpAndDown();

        const itemCards = await driver.findElements(By.css(itemCardsSelector));
        // scroll to bottom to load all items
        await driver.executeScript('window.scrollTo({left:0, top:document.body.scrollHeight, behavior:"smooth"});');
        await driver.sleep(1000 + Math.random() * 1000);

        // wait on final item to load
        await driver.wait(until.elementLocated(By.css(itemCardsSelector + ':last-child')), 60000);
        if (null !== itemOnPageOverride) {
            console.log(`overriding item on page to :: `,
                itemOnPageOverride,
                ` and ending at ::  `,
                itemOnPageOverrideEnd);
        }
        const startAt = itemOnPageOverride || itemCards.length - 1; // start at end or specified start
        const endAt = itemOnPageOverrideEnd || 0; // end at specified end or start
        for (let j = startAt; j >= endAt; j--) {
            const itemCard = itemCards[j];

            try { // make sure the thumbnail injection worked, otherwise leave it incomplete and try again next time
                await driver.wait(until.elementLocated(By.css(`.thumbnail__image`)), 10000);
            } catch (error) {
                console.error('NO DATA ON THIS ITEM WAITING...', error);
                await driver.sleep(1000 + Math.random() * 1000);
                continue;
            }

            let internalIdNode;
            try {
                internalIdNode = await itemCard.findElement(By.css(`.thumbnail__image`));
            } catch (error) {
                console.error('NO DATA ON THIS ITEM NODE...', error);
                await driver.sleep(1000 + Math.random() * 1000);
                continue;
            }

            const internalIdRaw = await internalIdNode.getAttribute('src');
            const fileIdPieces = internalIdRaw.split('/');
            const fileIdDirty = fileIdPieces[fileIdPieces.length - 1];

            const fileId = fileIdDirty.split('_')[0]; // BAM
            const internalId = internalIdRaw.split('/')[5];

            const documentTypeSelector = `.result-card__left .card-header__type`
            const documentType = await itemCard.findElement(By.css(documentTypeSelector)).getText();

            const scannedTextSelector = `.result-card__left .result-card__ocr-text`
            const scannedText = await itemCard.findElement(By.css(scannedTextSelector)).getText();

            const bookVolumePageSelector = `.result-card__left div:nth-of-type(2) div:nth-of-type(2) p:nth-of-type(2)`
            const bookVolumePage = await itemCard.findElement(By.css(bookVolumePageSelector)).getText();

            const considerationSelector = `.result-card__left div:nth-of-type(1) div:nth-of-type(4) p:nth-of-type(2)`
            const consideration = await itemCard.findElement(By.css(considerationSelector)).getText();

            const documentCountSelector = `.result-card__left div:nth-of-type(1) div:nth-of-type(2) p:nth-of-type(2)`
            const documentCount = await itemCard.findElement(By.css(documentCountSelector)).getText();

            const documentNumberSelector = `.result-card__left div:nth-of-type(1) div:nth-of-type(1) p:nth-of-type(2)`
            const documentNumber = await itemCard.findElement(By.css(documentNumberSelector)).getText();

            const documentStatusSelector = `.result-card__left div:nth-of-type(2) div:nth-of-type(1) p:nth-of-type(2)`
            const documentStatus = await itemCard.findElement(By.css(documentStatusSelector)).getText();

            const grantorsSelector = `.result-card td:nth-of-type(1)`
            const grantors = await itemCard.findElement(By.css(grantorsSelector)).getText();

            const grateesSelector = `.result-card td:nth-of-type(2)`
            const gratees = await itemCard.findElement(By.css(grateesSelector)).getText();

            const instrumentDateSelector = `.result-card__left div:nth-of-type(2) div:nth-of-type(3) p:nth-of-type(2)`
            const instrumentDate = await itemCard.findElement(By.css(instrumentDateSelector)).getText();

            const legalDescriptionSelector = `.result-card td:nth-of-type(3)`
            const legalDescription = await itemCard.findElement(By.css(legalDescriptionSelector)).getText();

            const recordedDateSelector = `.result-card__left div:nth-of-type(1) div:nth-of-type(3) p:nth-of-type(2)`
            const recordedDate = await itemCard.findElement(By.css(recordedDateSelector)).getText();

            const nextLeaseBundle = {
                bookVolumePage,
                consideration,
                documentCount,
                documentNumber,
                documentStatus,
                documentType,
                fileId,
                grantors,
                gratees,
                instrumentDate,
                legalDescription,
                recordedDate,
                scannedText,
            }

            await trackPayloadInit(internalId, fileId, documentCount);

            const fileSet = await downloadFiles(internalId, fileId, documentCount);
            await saveMetadata(internalId, nextLeaseBundle);
            await writeFileToAzure('us-leases', `texas/reeves/${internalId.toString()[0]}/${internalId}/${internalId}.json`, JSON.stringify(nextLeaseBundle, null, 2));

            let nextPDF;
            try {
                nextPDF = await new PDFGenerator().generatePDF(internalId, fileSet, JSON.stringify(nextLeaseBundle, null, 2));
                await writeFileToAzure('us-leases', `texas/reeves/${internalId.toString()[0]}/${internalId}/DOC-${internalId}.pdf`, nextPDF);
                await trackPayloadComplete(internalId, fileId, documentCount);
            } catch (error) {
                console.error(`Error generating PDF for ${internalId}:`, error);
            }
            console.log(`${curPageExtractor} Lease Complete`, internalId, `page`, page, `of`, totalPagesExtractor, `, items left: `, j);
        }
        // reset the item on page specifics once the page is done...
        itemOnPageOverride = null;
        itemOnPageOverrideEnd = null;
    }

    async function writeFileToAzure(containerName: string, fileName: string, content: string) {
        const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
        const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING!);
        const containerClient = blobServiceClient.getContainerClient(containerName);
        const blockBlobClient = containerClient.getBlockBlobClient(fileName);
        await blockBlobClient.upload(content, Buffer.byteLength(content));
        //console.log(`File ${fileName} uploaded to Azure container ${containerName}`);
    }

    async function saveMetadata(internalId, metadata) {
        // save to db
        await collection.insertOne(metadata);
        // save json to disk
        //fs.writeFileSync(`${process.env.SAVE_FOLDER}/${internalId.toString()[0]}/${internalId}/${internalId}.json`, JSON.stringify(metadata, null, 2));
    }

    function hasNextPageExtractor() {
        console.log("hasNextPageExtractor", totalPagesExtractor, 'total pages, currently on page', curPageExtractor as number + 1);
        if (!totalPagesExtractor) return false
        const final = curPageExtractor < totalPagesExtractor;
        if (
            (offsetOverrideEnd && curPageExtractor >= offsetOverrideEnd)
            && null === itemOnPageOverrideEnd) { // not overriding end page, so its done
            console.log(`reached override stop at pagination :: `, offsetOverrideEnd);
            offsetOverrideEnd = null;
            return false;
        }
        return final;
    }

    async function trackPayloadInit(internalId, fileId, documentCount) {
        await db.collection('payloads').insertOne({
            internalId,
            fileId,
            documentCount,
            status: 'init'
        });
    }

    async function trackPayloadComplete(internalId, fileId, documentCount) {
        await db.collection('payloads').updateOne({
            internalId,
            fileId,
            documentCount
        }, {
            $set: {
                status: 'complete'
            }
        });
    }

    async function downloadFiles(internalId: string, fileId: string, count: number) {
        const fileSet = new Array<Buffer>();
        for (let i = 1; i <= count; i++) {
            const url = assetTemplate
                .replace('%internalId%', internalId)
                .replace('%fileId%', fileId)
                .replace('%count%', i.toString());

            const savePath = `${process.env.SAVE_FOLDER}/${internalId.toString()[0]}/${internalId}/${fileId}_${i}.png`;
            fs.mkdirSync(path.dirname(savePath), { recursive: true });

            // Set headers for the request
            const headers = {
                'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'accept-encoding': 'gzip, deflate, br, zstd',
                'accept-language': 'en-US,en;q=0.9',
                'cache-control': 'no-cache',
                'connection': 'keep-alive',
                'cookie': '__stripe_mid=5a7e58f1-8894-45b2-829b-df6536374db6f34a71; authToken=ed6e1b53-f95b-41dc-bfb6-712bc0bce79f; authToken.sig=7unSqOtfSnMy5D469u_n2jfi6S0; _gid=GA1.2.190710498.1731513567; __stripe_sid=08d544b5-170c-417d-b707-e6a91b338cb2ac3e89; _ga=GA1.1.541308718.1730226596; _ga_R8DLNV5LWZ=GS1.1.1731630540.33.1.1731630610.0.0.0; _gat_gtag_UA_115781850_1=1',
                'host': 'reeves.tx.publicsearch.us',
                'pragma': 'no-cache',
                'referer': 'https://reeves.tx.publicsearch.us/doc/223440375',
                'sec-ch-ua': '"Google Chrome";v="129", "Not=A?Brand";v="8", "Chromium";v="129"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"macOS"',
                'sec-fetch-dest': 'document',
                'sec-fetch-mode': 'navigate',
                'sec-fetch-site': 'same-origin',
                'sec-fetch-user': '?1',
                'upgrade-insecure-requests': '1',
                'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
            };

            try {
                const response = await fetch(url, { headers });
                const buffer: any = await response.buffer();
                fileSet.push(buffer);
                fs.writeFileSync(savePath, buffer);
                await writeFileToAzure('us-leases', `texas/reeves/${internalId.toString()[0]}/${internalId}/${fileId}_${i}.png`, buffer);
            } catch (error) {
                console.error(`Failed to download ${url}:`, error);
            }
            await driver.sleep(250 + Math.random() * 1000);
        }
        console.log(`Downloaded ${count} files for ${internalId} ${fileId}`);
        return fileSet;
    }

    const client = await MongoClient.connect(process.env.MONGODB_URI!);
    db = client.db();
    collection = db.collection('seed-data');
    blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING!);
    driver = await new Builder().forBrowser(Browser.CHROME).build();

    try {
        await iterateThroughMonths();
    } catch (error) {
        console.error(error);
    } finally {
        await client.close();
        await driver.quit();
    }
})({
    offsetOverride: _offsetOverride || null,
    itemOnPageOverride: _itemOnPageOverride || null,
    offsetOverrideEnd: _offsetOverrideEnd || null,
    itemOnPageOverrideEnd: _itemOnPageOverrideEnd || null,
    startYear: _startYear,
    startMonth: _startMonth,
    endYear: _endYear,
    endMonth: _endMonth,
});
