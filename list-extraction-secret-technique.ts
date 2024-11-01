import { By, Builder, Browser, until } from 'selenium-webdriver';
import { MongoClient } from 'mongodb';
import filterConfig from './document-types.json';
import fs from 'fs';
import path from 'path';
import countyCodes from './county-codes.json';
import fetch from 'node-fetch';
import { Readable } from 'stream';
import { finished } from 'stream/promises';

const dotenv = require('dotenv');
dotenv.config();
// list page sample:
// https://reeves.tx.publicsearch.us/results
// ?department=RP
// &limit=50
// &offset=50
// &recordedDateRange=18000101%2C20241028
// &searchOcrText=false
// &searchType=quickSearch
const assetTemplate = `https://reeves.tx.publicsearch.us/files/documents/%internalId%/images/%fileId%_%count%.png`

async function downloadFile(internalId, fileId, count, metadata) {
  for (let i = 1; i <= count; i++) {
    const url = assetTemplate
      .replace('%internalId%', internalId)
      .replace('%fileId%', fileId)
      .replace('%count%', i.toString());

    const savePath = `${process.env.SAVE_FOLDER}/${internalId}/${fileId}_${i}.png`;
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
      console.log(`Fetching URL: ${url}`);
      const response = await fetch(url, { headers });
      const buffer = await response.buffer();
      fs.writeFileSync(savePath, buffer);
      console.log(`Downloaded: ${savePath}`);
    } catch (error) {
      console.error(`Failed to download ${url}:`, error);
    }
  }
}


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

(async function BigTexas(startAtFilterIndex = 0, startAtPageIndex = 0) {
  const targetUrl = "https://reeves.tx.publicsearch.us";
  const targetDepartment = "RP";
  const targetDateRange = "18000101,20241028";
  const targetSearchType = "quickSearch";
  const limit = 50;
  let curPage = startAtFilterIndex;
  let curPageExtractor = 0;
  let driver;
  let maxResults: number | null = null;
  let maxResultsExtractor: number | null = null;
  let totalPages: number | null = null;
  let totalPagesExtractor: number | null = null;
  const pageSize = 50;

  async function pageExtractor(url) {
    await driver.sleep(2000 + Math.random() * 1000);
    // get crawl stats from first page
    await driver.get(url + '&offset=0', { timeout: 60000 }); // first 
    const totalResultsSelector = `[data-testid="resultsSummary"] > span:nth-of-type(1)`;
    await driver.wait(until.elementLocated(By.css(totalResultsSelector)), 10000);
    const maxResultsText = await driver.findElement(By.css(totalResultsSelector)).getText();
    maxResultsExtractor = parseInt(maxResultsText.split('of')[1].split('results')[0].replace(/,/g, '').trim());
    totalPagesExtractor = Math.ceil(maxResultsExtractor / pageSize);
    if (hasNextPageExtractor()) {
      await getNextPageExtractor(url, ++curPageExtractor)
    } else {
      console.log("no more pages for this extractor");
      return;
    }
  }

  async function getNextPageExtractor(url, page) {
    await driver.sleep(2000 + Math.random() * 1000);
    if (curPageExtractor > 1) {
      await driver.get(url, { timeout: 10000 });
    }
    const itemCardsSelector = `.result-card`
    await driver.wait(until.elementLocated(By.css(itemCardsSelector)), 10000);
    const itemCards = await driver.findElements(By.css(itemCardsSelector));
    for (const itemCard of itemCards) {
      const internalIdNode = await itemCard.findElement(By.css(`.thumbnail__image`));
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
      await downloadFile(internalId, fileId, documentCount, nextLeaseBundle);
      await saveMetadata(internalId, nextLeaseBundle);
    }
  }

  async function saveMetadata(internalId, metadata) {
    // save to db
    await collection.insertOne(metadata);
    console.log(`Metadata persisted`);
    // save json to disk
    fs.writeFileSync(`${process.env.SAVE_FOLDER}/${internalId}/${internalId}.json`, JSON.stringify(metadata, null, 2));
    console.log(`Metadata saved: ${process.env.SAVE_FOLDER}/${internalId}/${internalId}.json`);
  }

  function hasNextPageExtractor() {
    if (!totalPagesExtractor) return false
    return curPageExtractor < totalPagesExtractor;
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
    await getNextPage(filter, startAtPageIndex);
  }

  async function getNextPage(filter, startAtPageIndex = 0) {
    console.log("getNextPage", filter);
    if (startAtPageIndex) {
      curPage = startAtPageIndex;
    }
    if (curPage > 0) {
      const nextLink = `${targetUrl}/results?department=${targetDepartment}&limit=${limit}&offset=${(curPage) * limit}&viewType=card&searchOcrText=false&searchType=${targetSearchType}&recordedDateRange=${targetDateRange}${filter ? `&_docTypes=${encodeURIComponent(filter)}` : ''}`
      await driver.get(nextLink, { timeout: 60000 });
      await driver.manage().setTimeouts({ implicit: 500 });

    }
    try {
      await driver.wait(until.elementLocated(By.css("#main-content div.a11y-table > table > tbody > tr")), 10000);
    } catch (error) { // likely bad data double check
      console.error('NO DATA ON THIS PAGE...', error, `${targetUrl}/results?department=${targetDepartment}&limit=${limit}&offset=${(curPage) * limit}&searchOcrText=false&searchType=${targetSearchType}&recordedDateRange=${targetDateRange}${filter ? `&_docTypes=${encodeURIComponent(filter)}` : ''}`);
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
        id: curPage * pageSize + i,
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
      // TODO: INTEGRATE SUB PAGE CRAWLS grag sub page for storage ID
      // const nextURL = `https://reeves.tx.publicsearch.us/doc/${internalId}`;
      // await driver.get(nextURL, { timeout: 10000 });
      // await driver.manage().setTimeouts({ implicit: 500 });
      // const firstImageSelector = "#main-content > section > div.css-wnovuq > section > svg > g > image"
      // await driver.wait(until.elementLocated(By.css(firstImageSelector)), 10000);

      // const documentIdSelector = `[data-testid="docPreviewSummaryItemValue"]`
      // await driver.wait(until.elementLocated(By.css(documentIdSelector)), 10000);
      // const documentId = await driver.findElement(By.css(documentIdSelector)).getText();

      // const currentUrl = await driver.getCurrentUrl();
      // const urlObject = new URL(currentUrl);

      // console.log("extrenal Id, documentId", internalId, documentId);

      // // storage id
      // const numberOfImageSelectors = `[data-testid="docPreviewPageCount"]`
      // await driver.wait(until.elementLocated(By.css(numberOfImageSelectors)), 10000);
      // let numberOfImages = await driver.findElement(By.css(numberOfImageSelectors)).getText();
      // numberOfImages = numberOfImages.replace(/of /g, '');
      // console.log("numberOfImages", numberOfImages);

      // const firstImage = await driver.findElement(By.css(firstImageSelector));
      // const firstImageUrl = await firstImage.getAttribute('xlink:href');

      // const storageId = firstImageUrl.match(/\/(\d+)_1\.png$/)[1];

      // const basePath = firstImageUrl.replace(/\d+_1\.png$/, '');

      // const documentTitleSelector = `.doc-preview__summary-header > h2`;
      // await driver.wait(until.elementLocated(By.css(documentTitleSelector)), 10000);
      // const documentTitle = await driver.findElement(By.css(documentTitleSelector)).getText();

      // const documentMetadataSelector = `.doc-preview-summary__column-list-item`;
      // await driver.wait(until.elementLocated(By.css(documentMetadataSelector)), 10000);
      // const documentMetadata = await driver.findElements(By.css(documentMetadataSelector));

      // const documentMetadataObject = {};
      // for (const element of documentMetadata) {
      //   const spans = await element.findElements(By.css('span'));
      //   const key = await spans[0].getText();
      //   const value = await spans[1].getText();
      //   documentMetadataObject[key] = value;
      // }

      // const partiesSelector = `[data-testid="docPreviewParty"]`
      // await driver.wait(until.elementLocated(By.css(partiesSelector)), 10000);
      // const parties = await driver.findElements(By.css(partiesSelector));
      // const partiesObject = {};
      // const partyBlock = await parties[0].getText();
      // const partyPieces = partyBlock.split('\n');
      // // even index is the party name, odd index is the party role
      // for (let i = 0; i < partyPieces.length; i += 2) {
      //   partiesObject[partyPieces[i]] = partyPieces[i + 1];
      // }

      // const legalDescriptionsSelector = `.doc-preview__summary > div:nth-of-type(4)`
      // await driver.wait(until.elementLocated(By.css(legalDescriptionsSelector)), 10000);
      // let legalDescriptions = await driver.findElement(By.css(legalDescriptionsSelector)).getText();
      // legalDescriptions = legalDescriptions.split('\n');
      // legalDescriptions.shift();

      // const marginalReferencesSelector = `.doc-preview__summary > div:nth-of-type(5)`
      // await driver.wait(until.elementLocated(By.css(marginalReferencesSelector)), 10000);
      // const marginalReferenceAnchor = await driver.findElements(By.css(marginalReferencesSelector));
      // let marginalReferences = await marginalReferenceAnchor[0].findElements(By.css('div > div'));
      // const marginalReferenceMap = [];
      // for (const element of marginalReferences) {
      //   const link = await element.findElement(By.css('a')).getAttribute('href');
      //   const linkLabel = await element.findElement(By.css('a')).getText();
      //   const labels = await element.findElements(By.css('span'));
      //   const label = await labels[0].getText();
      //   const date = await labels[1].getText();
      //   marginalReferenceMap.push({ link, linkLabel, label, date });
      // }

      // const documentRemarksSelector = `.doc-preview__summary > div:nth-of-type(6)`
      // await driver.wait(until.elementLocated(By.css(documentRemarksSelector)), 10000);
      // let documentRemarks = await driver.findElement(By.css(documentRemarksSelector)).getText();

      // const lotBlockMetadataSelector = `.doc-preview__summary > div:nth-of-type(7)`
      // await driver.wait(until.elementLocated(By.css(lotBlockMetadataSelector)), 10000);
      // let lotBlockMetadata = await driver.findElement(By.css(lotBlockMetadataSelector)).getText();

      // const targetManifest = {
      //   storageId,
      //   basePath,
      //   numberOfImages,
      //   documentId,
      //   internalId,
      //   documentTitle,
      //   documentMetadata: documentMetadataObject,
      //   parties: partiesObject,
      //   legalDescriptions,
      //   marginalReferences: marginalReferenceMap,
      //   documentRemarks,
      //   lotBlockMetadata
      // }

      // console.log("targetManifest", targetManifest);
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
    curPage++; // done w/ last so increment
    return (curPage * pageSize) < maxResults;
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
    for (let i = startAtFilterIndex || 0; i < filterConfig.documentTypes.length; i++) {
      const cur = filterConfig.documentTypes[i]
      if (filterConfig[cur] && filterConfig[cur].length > 0) {
        for (const dateRange of filterConfig[cur]) {
          const specialTargetUrl = dateRange;
          // call pageExtractor w/ the full url
          await pageExtractor(specialTargetUrl);
          console.log("Special Case: targetUrl ", specialTargetUrl);
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
}(51, 0))