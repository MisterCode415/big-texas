const { By, Builder, Browser, until } = require('selenium-webdriver');
const { MongoClient } = require('mongodb');
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


(async function bruteForcePOC(startAtPage = 0) {
  const targetUrl = "https://reeves.tx.publicsearch.us";
  const targetDepartment = "RP";
  const targetDateRange = "18000101,20241028";
  const targetSearchType = "quickSearch";
  const limit = 250;
  let curPage = startAtPage;
  let driver;
  let maxResults = null;
  let totalPages = null;
  const pageSize = 250;

  async function getNextPage() {
    if (hasNextPage()) {
      await driver.get(`${targetUrl}/results?department=${targetDepartment}&limit=${limit}&offset=${(curPage - 1) * limit}&searchOcrText=false&searchType=${targetSearchType}&recordedDateRange=${targetDateRange}`, { timeout: 10000 });
      await driver.manage().setTimeouts({ implicit: 500 });
      try {
        await driver.wait(until.elementLocated(By.css("#main-content div.a11y-table > table > tbody > tr")), 10000);
      } catch (error) { // likely bad data double check
        console.error('NO DATA ON THIS PAGE...', error);
        const match = "Sorry about this!"
        await driver.wait(until.elementLocated(By.css("#content")), 10000);
        const errorMessage = await driver.findElement(By.css("#content")).getText();
        if (errorMessage.includes(match)) {
          return await getNextPage();
        } else {
          throw error; // something else went wrong
        }
      }
      if (!maxResults) {
        const totalResultsSelector = `[data-testid="resultsSummary"] > span:nth-of-type(1)`;
        await driver.wait(until.elementLocated(By.css(totalResultsSelector)), 10000);
        maxResults = await driver.findElement(By.css(totalResultsSelector)).getText();
        maxResults = parseInt(maxResults.split('of')[1].split('results')[0].replace(/,/g, '').trim());
        totalPages = Math.ceil(maxResults / pageSize);
      }
      console.log("page loaded, ", curPage, '-', totalPages);
      let results = await driver.findElements(By.css("#main-content div.a11y-table > table > tbody > tr"));
      let i = 0;
      const resultBatch = [];
      for (element of results) {
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
          id: (curPage - 1) * pageSize + i,
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
      await driver.sleep(1000 + Math.random() * 1000);
      return await getNextPage();
    } else {
      console.log("no more pages");
      return;
    }
  }

  async function hasNextPage() {
    curPage++; // done w/ last so increment
    return (curPage * pageSize) < maxResults;
  }

  console.log(`time start: ${new Date().toISOString()}`);
  const startTime = new Date();
  const client = await MongoClient.connect(process.env.MONGODB_URI);
  const db = client.db();
  const collection = db.collection('seed-data');

  try {
    driver = await new Builder().forBrowser(Browser.CHROME).build();
    await getNextPage();
  } catch (error) {
    console.error(error);
  } finally {
    await client.close();
    await driver.quit();
    console.log(`time end: ${new Date().toISOString()}`);
    console.log(`time elapsed: ${new Date().getTime() - startTime.getTime()}ms, ${Math.floor((new Date().getTime() - startTime.getTime()) / 60000)} minutes, ${Math.floor((new Date().getTime() - startTime.getTime()) / 3600000)} hours`);
  }
}(58)) // start at page 0