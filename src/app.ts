/**
 * The following lines intialize dotenv,
 * so that env vars from the .env file are present in process.env
 */
import * as dotenv from 'dotenv';
dotenv.config();

import { startBrowser } from './browser';
import { scrapeAll } from './pageController';
import { exit } from 'process';

(async () => {
    let browser = await startBrowser();
    const meetings = await scrapeAll(browser)

    var fs = require('fs');
    fs.writeFile('meetings.json', JSON.stringify(meetings), 'utf8', () => {
        exit();
    });    
})();
