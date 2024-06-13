import { Browser } from "puppeteer";
import { scraperObject } from './pageScraper';

export async function scrapeAll(browserInstance: Browser, weekday: string){
	let browser;
	try{
		browser = await browserInstance;
		return scraperObject.scraper(browser, weekday);	
	}
	catch(err){
		console.log("Could not resolve the browser instance => ", err);
	}
}