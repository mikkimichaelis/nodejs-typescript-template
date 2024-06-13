/**
 * The following lines intialize dotenv,
 * so that env vars from the .env file are present in process.env
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
dotenv.config();

import { startBrowser } from './browser';
import { scrapeAll } from './pageController';
import { exit } from 'process';
import { Meeting } from './shared/models/meeting';

(async () => {
    let browser = await startBrowser();
    for await (const weekday of Meeting.weekdays.reverse()) {
        console.log(weekday);
        try {
            const meetings = await scrapeAll(browser, weekday)
            fs.writeFileSync(`${weekday.toLowerCase()}.json`, JSON.stringify(meetings?.map(m => m.toObject())), 'utf8');
        } catch (e) {
            console.error(e);
            debugger;
        }
    }
    exit();
})();
