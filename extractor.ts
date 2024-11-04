import { By, Builder, Browser, until } from 'selenium-webdriver';
import { MongoClient } from 'mongodb';
import filterConfig from './document-types.json';
import fs from 'fs';
import path from 'path';
import countyCodes from './county-codes.json';
import fetch from 'node-fetch';
import { argv } from 'process';
import { BlobServiceClient } from '@azure/storage-blob';

const dotenv = require('dotenv');
dotenv.config();

console.log('argv ', argv);

// parse args key=value
const args = argv.slice(2).map(arg => arg.split('='));
console.log('args ', args);
// assign args to variables
const _startAtFilterIndex = args.find(arg => arg[0] === 'startAtFilterIndex')?.[1];
const _startAtPageIndex = args.find(arg => arg[0] === 'startAtPageIndex')?.[1];
const _offsetOverride = args.find(arg => arg[0] === 'offsetOverride')?.[1];
const _itemOnPageOverride = args.find(arg => arg[0] === 'itemOnPageOverride')?.[1];

const _endAtFilterIndex = args.find(arg => arg[0] === 'endAtFilterIndex')?.[1];
const _endAtPageIndex = args.find(arg => arg[0] === 'endAtPageIndex')?.[1];
const _offsetOverrideEnd = args.find(arg => arg[0] === 'offsetOverrideEnd')?.[1];
const _itemOnPageOverrideEnd = args.find(arg => arg[0] === 'itemOnPageOverrideEnd')?.[1];

const _oneShot = args.find(arg => arg[0] === 'oneShot')?.[1];

const assetTemplate = `https://reeves.tx.publicsearch.us/files/documents/%internalId%/images/%fileId%_%count%.png`

function findDescription(targetDescription) {
  for (const group of countyCodes.codes) {
    for (const doc of group.docGroup) {
      for (const type of doc.docType) {
        if (type.description === targetDescription) {
          console.log(`Found: ${type.description} in code: ${type.code}`);
          return type.code; // Exit after finding the first match
        }
      }
    }
  }
  console.log(`Description "${targetDescription}" not found.`);
  return null;
}

(async function BigTexas({
  startAtFilterIndex,
  startAtPageIndex,
  offsetOverride,
  itemOnPageOverride,
  endAtFilterIndex,
  endAtPageIndex,
  offsetOverrideEnd,
  itemOnPageOverrideEnd
}: any, config = { oneShot: false }) {
  // convert args to numbers
  startAtFilterIndex = determine(startAtFilterIndex)
  startAtPageIndex = determine(startAtPageIndex)
  offsetOverride = determine(offsetOverride)
  itemOnPageOverride = determine(itemOnPageOverride)

  endAtFilterIndex = determine(endAtFilterIndex)
  endAtPageIndex = determine(endAtPageIndex)
  offsetOverrideEnd = determine(offsetOverrideEnd)
  itemOnPageOverrideEnd = determine(itemOnPageOverrideEnd)

  function determine(argument) {
    return parseInt(argument as string) >= 0 ? parseInt(argument as string) : null;
  }

  const targetUrl = "https://reeves.tx.publicsearch.us";
  const targetDepartment = "RP";
  const targetDateRange = "18000101,20241028";
  const targetSearchType = "quickSearch";
  const limit = 50;
  let curPage = startAtFilterIndex;
  let curPageExtractor = 0;
  let driver: any;
  let maxResults: number | null = null;
  let maxResultsExtractor: number | null = null;
  let totalPages: number | null = null;
  let totalPagesExtractor: number | null = null;
  const pageSize = 50;

  async function stepScrollFromBottom() {
    const steps = await driver.executeScript('return Math.ceil(document.body.scrollHeight / window.innerHeight)');
    const stepHeight = await driver.executeScript('return window.innerHeight');
    for (let i = steps; i > 0; i--) {
      const nextStep = i * stepHeight;
      await driver.executeScript(`window.scrollTo({left:0, top:${nextStep}, behavior:"smooth"});`);
      await driver.sleep(1000 + Math.random() * 1000);
    }
  }

  async function downloadFiles(internalId, fileId, count) {
    for (let i = 1; i <= count; i++) {
      const url = assetTemplate
        .replace('%internalId%', internalId)
        .replace('%fileId%', fileId)
        .replace('%count%', i.toString());

      const savePath = `${process.env.SAVE_FOLDER}/${internalId.toString()[0]}/${internalId}/${fileId}_${i}.png`;
      fs.mkdirSync(path.dirname(savePath), { recursive: true });

      // Set headers for the request
      const headers = {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Cookie': 'authToken=9feccbdd-8daa-41e4-80b1-2528875b5c88; authToken.sig=fY1_Ui1YO2SL3qo6cCvcsjpPCrw; _ga_R8DLNV5LWZ=GS1.1.1730490696.1.0.1730490696.0.0.0; _ga=GA1.2.2123656417.1730490697; _gid=GA1.2.1829217426.1730490697; __stripe_mid=68b879aa-f786-4853-9e08-760ad5e83033691c86; __stripe_sid=93a70e8f-1973-4aac-863d-cc7d537b97028f92ad; _gat_gtag_UA_115781850_1=1',
        'Host': 'reeves.tx.publicsearch.us',
        'If-None-Match': '"87-8vUAd8oTw/9DZQZkWb4ge8Lh+aY"',
        'Referer': 'https://reeves.tx.publicsearch.us/doc/47054591',
        'Sec-CH-UA': '"Google Chrome";v="129", "Not=A?Brand";v="8", "Chromium";v="129"',
        'Sec-CH-UA-Mobile': '?0',
        'Sec-CH-UA-Platform': '"macOS"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36'
      };

      try {
        const response = await fetch(url, { headers });
        const buffer = await response.buffer();
        fs.writeFileSync(savePath, buffer);
        await writeFileToAzure('us-leases', `texas/reeves/${internalId.toString()[0]}/${internalId}/${fileId}_${i}.png`, buffer);
      } catch (error) {
        console.error(`Failed to download ${url}:`, error);
      }
      await driver.sleep(250 + Math.random() * 1000);
    }
    console.log(`Downloaded ${count} files for ${internalId} ${fileId}`);
  }

  async function pageExtractor(url) {
    await driver.sleep(2000 + Math.random() * 1000);
    // get crawl stats from first page
    // const nextUrl = url + '&offset=' + offsetOverride !== null ? offsetOverride : '0';
    const nextUrl = `${url} &offset=${offsetOverride !== null ? offsetOverride : '0'}`;
    await driver.get(nextUrl, { timeout: 60000 }); // first 
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
      console.log(`total pages: `, totalPagesExtractor, `current page: `, curPageExtractor);
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
    await stepScrollFromBottom();
    const itemCardsSelector = `.result-card`
    await driver.wait(until.elementLocated(By.css(itemCardsSelector)), 10000);
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
      try {
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
      await downloadFiles(internalId, fileId, documentCount);
      await saveMetadata(internalId, nextLeaseBundle);
      await writeFileToAzure('us-leases', `texas/reeves/${internalId.toString()[0]}/${internalId}/${internalId}.json`, JSON.stringify(nextLeaseBundle, null, 2));
      console.log(`Lease Complete`, internalId, `page`, page, `, items left: `, j);
    }
    // reset the item on page specifics once the page is done...
    itemOnPageOverride = null;
    itemOnPageOverrideEnd = null;
  }

  async function writeFileToAzure(containerName, fileName, content) {
    const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(fileName);
    await blockBlobClient.upload(content, Buffer.byteLength(content));
    //console.log(`File ${fileName} uploaded to Azure container ${containerName}`);
  }

  async function saveMetadata(internalId, metadata) {
    // save to db
    await collection.insertOne(metadata);
    // save json to disk
    fs.writeFileSync(`${process.env.SAVE_FOLDER}/${internalId.toString()[0]}/${internalId}/${internalId}.json`, JSON.stringify(metadata, null, 2));
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

  async function filterExtractor(filterFull) {
    console.log("new section timeout...", filterFull);
    await driver.sleep(2000 + Math.random() * 1000);

    // reset page status
    curPage = 0;
    maxResults = null;
    totalPages = null;
    // get first page to extract stats
    const filter = findDescription(filterFull)
    console.log("filter", filter);
    if (!filter) {
      throw new Error(`Filter ${filterFull} not found`);
    }
    const nextLink = `${targetUrl}/results?department=${targetDepartment}&limit=${limit}&offset=0&searchOcrText=false&viewType=card&searchType=${targetSearchType}&recordedDateRange=${targetDateRange}${filter ? `&_docTypes=${encodeURIComponent(filter)}` : ''}`
    await driver.get(nextLink, { timeout: 60000 });
    const totalResultsSelector = `[data-testid="resultsSummary"] > span:nth-of-type(1)`;
    await driver.wait(until.elementLocated(By.css(totalResultsSelector)), 10000);
    const maxResultsText = await driver.findElement(By.css(totalResultsSelector)).getText();
    maxResults = parseInt(maxResultsText.split('of')[1].split('results')[0].replace(/,/g, '').trim());
    totalPages = Math.ceil(maxResults / pageSize);
    await driver.sleep(1500 + Math.random() * 1000);
    await getNextPage(filter, startAtPageIndex as number);
  }

  async function getNextPage(filter, startAtPageIndex = 0) {
    console.log("getNextPage", filter);
    if (startAtPageIndex) {
      curPage = startAtPageIndex as number;
    }
    if (curPage as number > 0) {
      const nextLink = `${targetUrl}/results?department=${targetDepartment}&limit=${limit}&offset=${(curPage as number) * limit}&viewType=card&searchOcrText=false&searchType=${targetSearchType}&recordedDateRange=${targetDateRange}${filter ? `&_docTypes=${encodeURIComponent(filter)}` : ''}`
      await driver.get(nextLink, { timeout: 60000 });
      await driver.manage().setTimeouts({ implicit: 500 });

    }
    try {
      await driver.wait(until.elementLocated(By.css("#main-content div.a11y-table > table > tbody > tr")), 10000);
    } catch (error) { // likely bad data double check
      console.error('NO DATA ON THIS PAGE...', error, `${targetUrl}/results?department=${targetDepartment}&limit=${limit}&offset=${(curPage as number) * limit}&searchOcrText=false&searchType=${targetSearchType}&recordedDateRange=${targetDateRange}${filter ? `&_docTypes=${encodeURIComponent(filter)}` : ''}`);
      const match = "Sorry about this!"
      await driver.wait(until.elementLocated(By.css("#content")), 10000);
      const errorMessage = await driver.findElement(By.css("#content")).getText();
      if (errorMessage.includes(match)) {
        return await getNextPage(filter);
      } else {
        throw error; // something else went wrong
      }
    }
    console.log("page loaded, ", curPage, '-', totalPages);
    let results = await driver.findElements(By.css("#main-content div.a11y-table > table > tbody > tr"));
    let i = 0;
    const resultBatch = new Array();
    for (let element of results) {
      let internalIdRaw = await element.findElement(By.css("td:nth-child(1) input")).getAttribute("id");
      let grantors = await element.findElement(By.css("td:nth-child(4) span")).getText();
      let gratees = await element.findElement(By.css("td:nth-child(5) span")).getText();
      let docType = await element.findElement(By.css("td:nth-child(6) span")).getText();
      let recordedDate = await element.findElement(By.css("td:nth-child(7) span")).getText();
      let docNumber = await element.findElement(By.css("td:nth-child(8) span")).getText();
      let bookVolumePage = await element.findElement(By.css("td:nth-child(9) span")).getText();
      let legalDescription = await element.findElement(By.css("td:nth-child(10) span")).getText();

      const internalId = internalIdRaw.split('-')[2];
      const queueItem = {
        id: curPage as number * pageSize + i,
        internalId,
        grantors,
        gratees,
        docType,
        recordedDate,
        docNumber,
        bookVolumePage,
        legalDescription,
      }
      resultBatch.push(queueItem);
      i++;
    }
    // save batch
    await collection.insertMany(resultBatch);
    await driver.sleep(2000 + Math.random() * 1000);

    if (await hasNextPage()) {
      return await getNextPage(filter);
    } else {
      console.log("no more pages");
      return;
    }
  }

  async function hasNextPage() {
    if (!maxResults) {
      return false;
    }
    curPage = curPage as number + 1; // done w/ last so increment
    return (curPage as number * pageSize) < maxResults;
  }

  console.log(`time start: ${new Date().toISOString()}`);
  const startTime = new Date();
  const client = await MongoClient.connect(process.env.MONGODB_URI!);
  const db = client.db();
  const collection = db.collection('seed-data');
  driver = await new Builder().forBrowser(Browser.CHROME).build();
  if (startAtFilterIndex) {
    console.log(`starting at filter index ${startAtFilterIndex}`);
  }
  try {
    for (let i = startAtFilterIndex as number || 0; i <= (endAtFilterIndex as number || filterConfig.documentTypes.length); i++) {
      const cur = filterConfig.documentTypes[i]
      if (filterConfig[cur] && filterConfig[cur].length > 0) {
        if (config.oneShot) {
          console.log("One Shot Mode");
          const specialTargetUrl = filterConfig[cur][startAtPageIndex as number].replace('%LIMIT%', limit);
          await pageExtractor(specialTargetUrl);
          offsetOverride = 0; // reset for rest of list
          console.log("Special Case: targetUrl ", specialTargetUrl);
        } else {
          console.log("Multi Shot Mode");
          for (let j = startAtPageIndex as number; j < (endAtPageIndex as number || filterConfig[cur].length); j++) {
            const specialTargetUrl = filterConfig[cur][j];
            await pageExtractor(specialTargetUrl);
            offsetOverride = 0; // reset for rest of list
            console.log("Special Case: targetUrl ", specialTargetUrl);
          }
        }
      } else {
        console.log("Target Filter ", cur);
        await filterExtractor(cur);
      }
    }
  } catch (error) {
    console.error(error);
  } finally {
    await client.close();
    await driver.quit();
    console.log(`time end: ${new Date().toISOString()}`);
    console.log(`time elapsed: ${new Date().getTime() - startTime.getTime()}ms, ${Math.floor((new Date().getTime() - startTime.getTime()) / 60000)} minutes, ${Math.floor((new Date().getTime() - startTime.getTime()) / 3600000)} hours`);
  }
}({
  startAtFilterIndex: _startAtFilterIndex || null,
  startAtPageIndex: _startAtPageIndex || null,
  offsetOverride: _offsetOverride || null,
  itemOnPageOverride: _itemOnPageOverride || null,
  endAtFilterIndex: _endAtFilterIndex || null,
  endAtPageIndex: _endAtPageIndex || null,
  offsetOverrideEnd: _offsetOverrideEnd || null,
  itemOnPageOverrideEnd: _itemOnPageOverrideEnd || null,
}, {
  // }((argv[2] || 0), (argv[3] || 0), (argv[4] || 0), (argv[5] || 0), (argv[6] || 0), (argv[7] || 0), (argv[8] || 0), (argv[9] || 0), {
  oneShot: _oneShot === "true" ? true : false || false,
}));
// 51, 7, 0
// startAtFilterIndex = from the start of the list in any case, startAtPageIndex = start at initial offset or skip down the list of a special case
// offsetOverride = for special cases, start at a specific offset

// list page sample:
// https://reeves.tx.publicsearch.us/results
// ?department=RP
// &limit=50
// &offset=50
// &recordedDateRange=18000101%2C20241028
// &searchOcrText=false
// &searchType=quickSearch
