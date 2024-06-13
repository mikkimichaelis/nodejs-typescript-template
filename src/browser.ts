import { launch, Browser } from "puppeteer";

// const puppeteer = require('puppeteer');
export async function startBrowser(): Promise<Browser>{
	try {
	    console.log("Opening the browser......");
	    return await launch({
	        headless: 'new',
	        args: ["--disable-setuid-sandbox"],
	        'ignoreHTTPSErrors': true,
            protocolTimeout: 9999999
	    });
	} catch (err) {
	    console.log("Could not create a browser instance => : ", err);
        return <any>null;
	}
}