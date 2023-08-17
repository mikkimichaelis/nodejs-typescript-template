import { Browser } from "puppeteer";
import { scraperObject } from './pageScraper';

export async function scrapeAll(browserInstance: Browser){
	let browser;
	try{
		browser = await browserInstance;
		return scraperObject.scraper(browser);	
	}
	catch(err){
		console.log("Could not resolve the browser instance => ", err);
	}
}