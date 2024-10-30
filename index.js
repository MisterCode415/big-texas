const {By, Builder, Browser, until} = require('selenium-webdriver');
const assert = require("assert");

(async function firstTest() {
  let driver;
  
  try {
    driver = await new Builder().forBrowser(Browser.CHROME).build();
    //await driver.get('https://reeves.tx.publicsearch.us', {timeout: 10000 });
    await driver.get('https://reeves.tx.publicsearch.us/doc/31290350', {timeout: 10000 });
    
    // ENTRY POINT : TODO - FILTER SET
    // let title = await driver.getTitle();
    // await driver.manage().setTimeouts({implicit: 500});
  
    // let submitButton = await driver.findElement(By.css("#main-content form > div.basic-search > button"));
    // await submitButton.click();
    // // wait for the page to load
    // await driver.sleep(1000 + Math.random() * 1000);

    // console.log("waiting for the page to load");
    
    // await driver.wait(until.elementLocated(By.css("#main-content > div > div > div.search-results__results-wrap > div.a11y-table > table > tbody > tr")), 10000);
    // console.log("page loaded");
    
    // let results = await driver.findElements(By.css("#main-content > div > div > div.search-results__results-wrap > div.a11y-table > table > tbody > tr"));
    // console.log("results", results.length);

    // await driver.sleep(1000 + Math.random() * 1000);
    // await results[0].click();
    // console.log("clicked into the first result");

    const firstImageSelector = "#main-content > section > div.css-wnovuq > section > svg > g > image"
    await driver.wait(until.elementLocated(By.css(firstImageSelector)), 10000);

    const documentIdSelector = `[data-testid="docPreviewSummaryItemValue"]`
    await driver.wait(until.elementLocated(By.css(documentIdSelector)), 10000);
    const documentId = await driver.findElement(By.css(documentIdSelector)).getText();

    const currentUrl = await driver.getCurrentUrl();
    const urlObject = new URL(currentUrl);
    const internalId = urlObject.pathname.split('/').pop();

    console.log("extrenal Id, documentId", internalId, documentId);

    // storage id
    const numberOfImageSelectors = `[data-testid="docPreviewPageCount"]`
    await driver.wait(until.elementLocated(By.css(numberOfImageSelectors)), 10000);
    let numberOfImages = await driver.findElement(By.css(numberOfImageSelectors)).getText();
    numberOfImages = numberOfImages.replace(/of /g, '');
    console.log("numberOfImages", numberOfImages);

    const firstImage = await driver.findElement(By.css(firstImageSelector));
    const firstImageUrl = await firstImage.getAttribute('xlink:href');

    const storageId = firstImageUrl.match(/\/(\d+)_1\.png$/)[1];

    const basePath = firstImageUrl.replace(/\d+_1\.png$/, '');

    const documentTitleSelector = `.doc-preview__summary-header > h2`;
    await driver.wait(until.elementLocated(By.css(documentTitleSelector)), 10000);
    const documentTitle = await driver.findElement(By.css(documentTitleSelector)).getText();
    
    const documentMetadataSelector = `.doc-preview-summary__column-list-item`;
    await driver.wait(until.elementLocated(By.css(documentMetadataSelector)), 10000);
    const documentMetadata = await driver.findElements(By.css(documentMetadataSelector));

    const documentMetadataObject = {};
    for (const element of documentMetadata) {
      const spans = await element.findElements(By.css('span'));
      const key = await spans[0].getText();
      const value = await spans[1].getText();
      documentMetadataObject[key] = value;
    }

    const partiesSelector = `[data-testid="docPreviewParty"]`
    await driver.wait(until.elementLocated(By.css(partiesSelector)), 10000);
    const parties = await driver.findElements(By.css(partiesSelector));
    const partiesObject = {};
    const partyBlock = await parties[0].getText();
    const partyPieces = partyBlock.split('\n');
    // even index is the party name, odd index is the party role
    for (let i = 0; i < partyPieces.length; i += 2) {
      partiesObject[partyPieces[i]] = partyPieces[i + 1];
    }

    const legalDescriptionsSelector = `.doc-preview__summary > div:nth-of-type(4)`
    await driver.wait(until.elementLocated(By.css(legalDescriptionsSelector)), 10000);
    let legalDescriptions = await driver.findElement(By.css(legalDescriptionsSelector)).getText();
    legalDescriptions = legalDescriptions.split('\n');
    legalDescriptions.shift();

    const marginalReferencesSelector = `.doc-preview__summary > div:nth-of-type(5) > div > div`
    await driver.wait(until.elementLocated(By.css(marginalReferencesSelector)), 10000);
    let marginalReferences = await driver.findElements(By.css(marginalReferencesSelector));
    const marginalReferenceMap = [];
    for (const element of marginalReferences) {
      const link = await element.findElement(By.css('a')).getAttribute('href');
      const linkLabel = await element.findElement(By.css('a')).getText();
      const labels = await element.findElements(By.css('span'));
      const label = await labels[0].getText();
      const date = await labels[1].getText();
      marginalReferenceMap.push({link, linkLabel, label, date});
    }

    const targetManifest = {
      storageId,
      basePath,
      numberOfImages,
      documentId,
      internalId,
      documentTitle,
      documentMetadata: documentMetadataObject,
      parties: partiesObject,
      legalDescriptions,
      marginalReferences: marginalReferenceMap
    }

    console.log("targetManifest", targetManifest);

    const nextLinkSelector = `#primary > button`
    await driver.wait(until.elementLocated(By.css(nextLinkSelector[2])), 10000);
    const nextLink = await driver.findElement(By.css(nextLinkSelector[2])); // follow me until the end of time
    console.log("nextLink", nextLink);
    
  } catch (e) {
    console.log(e)
  } finally {
    //await driver.quit();
  }
}())