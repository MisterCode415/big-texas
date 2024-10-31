const { By, Builder, Browser, until } = require('selenium-webdriver');
const assert = require("assert");

// list page sample:
// https://reeves.tx.publicsearch.us/results
// ?department=RP
// &limit=50
// &offset=50
// &recordedDateRange=18000101%2C20241028
// &searchOcrText=false
// &searchType=quickSearch


(async function bruteForcePOC() {
  const targetUrl = "https://reeves.tx.publicsearch.us";
  const targetDepartment = "RP";
  const targetDateRange = "18000101,20241028";
  const targetSearchType = "quickSearch";
  const limit = 250;
  let offset = 0;
  let curPage = 0;
  let driver;
  let maxResults = null;
  let maxPages = null;
  const pageSize = 250;

  async function getNextPage() {
    if (hasNextPage()) {
      await driver.get(`https://reeves.tx.publicsearch.us/results?department=${targetDepartment}&limit=${limit}&offset=${(curPage - 1) * limit}&searchOcrText=false&searchType=${targetSearchType}&recordedDateRange=${targetDateRange}`, { timeout: 10000 });
      await driver.manage().setTimeouts({ implicit: 500 });
      await driver.wait(until.elementLocated(By.css("#main-content div.a11y-table > table > tbody > tr")), 10000);
      console.log("page loaded");
      let results = await driver.findElements(By.css("#main-content div.a11y-table > table > tbody > tr"));
      for (element of results) {
        let internalIdRaw = await element.findElement(By.css("td:nth-child(1) input")).getAttribute("id");

        const internalId = internalIdRaw.split('-')[2];
        console.log(`internalId`, internalId);
      }
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

  driver = await new Builder().forBrowser(Browser.CHROME).build();
  await getNextPage();

}())