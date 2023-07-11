const scraperObject = {
	url: 'http://books.toscrape.com',
	async scraper(browser: any){
		let page = await browser.newPage();
		console.log(`Navigating to ${this.url}...`);
		await page.goto(this.url);
		
	}
}

module.exports = scraperObject;