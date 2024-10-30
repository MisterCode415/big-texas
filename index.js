const {By, Builder, Browser, until} = require('selenium-webdriver');
const assert = require("assert");

(async function firstTest() {
  let driver;
  
  try {
    driver = await new Builder().forBrowser(Browser.CHROME).build();
    await driver.get('https://reeves.tx.publicsearch.us', {timeout: 10000 });
    let title = await driver.getTitle();
    await driver.manage().setTimeouts({implicit: 500});
  
    let submitButton = await driver.findElement(By.css("#main-content form > div.basic-search > button"));
    await submitButton.click();
    // wait for the page to load
    await driver.sleep(1000 + Math.random() * 1000);

    console.log("waiting for the page to load");
    
    await driver.wait(until.elementLocated(By.css("#main-content > div > div > div.search-results__results-wrap > div.a11y-table > table > tbody > tr")), 10000);
    console.log("page loaded");
    
    let results = await driver.findElements(By.css("#main-content > div > div > div.search-results__results-wrap > div.a11y-table > table > tbody > tr"));
    console.log("results", results.length);

    await driver.sleep(1000 + Math.random() * 1000);
    await results[0].click();
    console.log("clicked into the first result");

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
    const numberOfImages = await driver.findElement(By.css(numberOfImageSelectors)).getText();
    console.log("numberOfImages", numberOfImages.replace(/of /g, ''));

    const firstImage = await driver.findElement(By.css(firstImageSelector));
    const firstImageUrl = await firstImage.getAttribute('xlink:href');
    console.log("firstImageUrl", firstImageUrl);

    const storageId = firstImageUrl.match(/\/(\d+)_1\.png$/)[1];
    console.log("Storage Number:", storageId);

    const basePath = firstImageUrl.replace(/\d+_1\.png$/, '');
    console.log("basePath", basePath);

    await driver.sleep(1000 + Math.random() * 1000);

  } catch (e) {
    console.log(e)
  } finally {
    //await driver.quit();
  }
}())