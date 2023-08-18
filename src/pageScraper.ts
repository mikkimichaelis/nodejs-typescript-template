import { Browser, Page } from "puppeteer";
import { Meeting } from './shared/models/meeting';
import { DateTime } from 'luxon';
import { meetingData } from './shared/data/meeting-types';
import { split } from "lodash";

export const scraperObject = {
    url: 'https://virtual-na.org/meetings/',
    async scraper(browser: Browser) {
        let page: Page = await browser.newPage();
        console.log(`Navigating to ${this.url}...`);
        await page.goto(this.url);

        // Wait for the required DOM to be rendered
        await page.waitForSelector('#bmlt-table-div > table > tbody');

        let meetings = await page.$$eval('#bmlt-table-div > table > tbody > .bmlt-data-row', (meetings) => {
            return meetings.map(meeting => {
                const name = meeting.querySelector('.meeting-name')?.textContent || '';
                const location = meeting.querySelector('.location-text')?.textContent || '';
                const loc_info = meeting.querySelector('.location-information')?.textContent || '';
                const address = meeting.querySelector('.meeting-address')?.textContent || '';
                const additional = meeting.querySelector('.meeting-additional-info')?.textContent || '';
                const href = meeting.querySelector('td.bmlt-column3 > div:nth-child(1) > a')?.getAttribute('href') || '';
                const day = meeting.querySelector('td.bmlt-column1 > div.bmlt-day')?.textContent || '';
                const time = meeting.querySelector('td.bmlt-column1 > div.bmlt-time-2')?.textContent || '';
                const formats = meeting.querySelector('#bmlt-formats')?.innerHTML || '';

                if (name === 'Sydney Late Nighters revamped! One hour of power!') debugger;

                return {
                    day,
                    time,
                    name,
                    location,
                    loc_info,
                    address,
                    additional,
                    href,
                    formats,
                    password: '',
                    _password: '',
                    start: 0,
                    end: 0,
                    duration: 0,
                    time24h: '00:00',
                    recurrence: {},
                    types: [] as string[],
                    language: '',
                    zid: '',
                    closed: false,
                    description: '',
                    delete: false
                }
            });
        });

        // filter out all non zoom meetings
        meetings = meetings.filter(meeting => meeting.href?.includes('zoom'));

        // filter out all Temp meetings
        // meetings = meetings.filter(meeting => !meeting.name.split(' ').includes('Temp'));
 
        // extract passwords from additional
        meetings = meetings.map(meeting => {
            // find password or passcode or passwort (lol)
            let index = meeting.additional?.toLocaleLowerCase().indexOf('pass');
            // TODO 'password' is in other languages
            if (index !== -1) {
                const sub = meeting.additional.substring(index);    // strip off preceding characters
                meeting.password = sub.substring(sub.search(':') + 1).trim();   // find ':' and remove whitespace
                // handles 'pass* 123' w/o ':'
                meeting.password = meeting.password.split(' ').length > 1 ? meeting.password.split(' ')[1] : meeting.password;
            } else {
                // try extract from href
                const i = meeting.href.indexOf('?pwd=');
                if (i !== -1) {
                    meeting._password = meeting.href.substring(i + '?pwd='.length);
                }
            }
            return meeting;
        });

        // extract formats string and establish meeting types
        // "\n                                        <span class=\"glyphicon glyphicon-search\" aria-hidden=\"true\" data-toggle=\"popover\" data-trigger=\"focus\" data-html=\"true\" role=\"button\" data-original-title=\"\" title=\"\"></span>O,SD,YP,ENG,VM,VO\n                    \t\t\t\t"
        meetings = meetings.map(meeting => {

            let i: number = meeting.formats?.indexOf('</span>') || 0;
            meeting.formats = meeting.formats?.substring(i + 7).trimEnd();
            meeting.types = meeting.formats?.split(',');
            meeting.types = meeting.types.map(type => {

                // determine if type specifies a language
                switch (type) {
                    case 'ENG':
                        meeting.language = 'en';
                        break;
                    case 'ES':
                        meeting.language = 'es';
                        break;
                    case 'IT':
                        meeting.language = 'it'
                    case 'SL':
                        meeting.language = 'sign language'
                        break;
                    case 'ARA':
                        meeting.language = 'ar'
                        break;
                    case 'BN':
                        meeting.language = 'bn'
                        break;
                    case 'BUL':
                        meeting.language = 'bg'
                        break;
                    case 'NLD':
                        meeting.language = 'nl'
                        break;
                    case 'FR':
                        meeting.language = 'fr'
                        break;
                    case 'DE':
                        meeting.language = 'de'
                        break;
                    case 'HIN':
                        meeting.language = 'hi'
                        break;
                    case 'NE':
                        meeting.language = 'ne'
                        break;
                    case 'PER':
                        meeting.language = 'fa'
                        break;
                    case 'PT':
                        meeting.language = 'pt'
                        break;
                    case 'RU':
                        meeting.language = 'ru'
                        break;
                    case 'SW':
                        meeting.language = 'sw';
                        break;
                    case 'SV':
                        meeting.language = 'sv'
                        break;
                    default:
                        break;
                }

                const found = meetingData.types.find(mt => mt.code === type);
                if (found) {
                    if (!found.valid) {
                        if (found.tx) {
                            type = found.tx;
                        } else {
                            type = 'DEL';
                        }
                    } else {
                        type = found.code as string;
                    }
                } else {
                    // oh well....
                    // throw new Error(`unknown meetingType ${mt}`);
                    // debugger;
                    type = 'DEL';
                }
                return type;
            });

            meeting.types = meeting.types.filter(type => type !== 'DEL');

            // determine meeting language

            return meeting;
        });

        // extract start / end / duration / time24h / recurrence / closed / zid
        meetings = meetings.map(meeting => {
            // "13:00 (1:00pm) CDT - 14:15 (2:15pm) CDT"
            let segments = meeting.time?.split(' ');
            if (segments.length < 5) return null as any;    // invalid

            const zone = DateTime.now().zoneName as string;

            // this is to calculate duration only, start and end are otherwise not used
            meeting.start = Meeting.makeFrom24h_That70sDateTime(segments[0], zone, meeting.day).toMillis();
            meeting.end = Meeting.makeFrom24h_That70sDateTime(segments[4], zone, meeting.day).toMillis();
            if (meeting.end > meeting.start) {
                meeting.duration = meeting.end - meeting.start;
            } else {
                meeting.duration = (meeting.end + 24 * 60 * 60 * 1000) - meeting.start;
            }
            meeting.duration = meeting.duration / 60 / 1000;

            meeting.time24h = split(meeting.time, ' ')[0];  // this will be used in Meeting() update to calc start/end times
            meeting.recurrence = {
                type: 'Weekly',
                weekly_day: meeting.day,
                weekly_days: [meeting.day]
            }

            meeting.closed = meeting.types.find(t => t === 'C') !== undefined;

            segments = meeting.href.split('/');
            meeting.zid = segments[segments.length - 1].split('?')[0]

            // fix some bad data
            if (meeting.zid.startsWith('j')) meeting.zid = meeting.zid.replace('j', '');

            if (isNaN(Number.parseInt(meeting.zid))) debugger;
            // As of my last knowledge update in September 2021, a Zoom meeting ID is a 9, 10, or 11-digit number.
            if (meeting.zid.length < 9 || meeting.zid.length > 11) debugger;

            meeting.description = `${meeting.location}\n${meeting.address}\n${meeting.loc_info}\n${meeting.additional}`;
            if (meeting.description.startsWith('\n')) meeting.description = meeting.description.slice(1);
            if (meeting.description.endsWith('\n')) meeting.description = meeting.description.slice(0, meeting.description.length - 1);
            if (meeting.description.endsWith('\n')) meeting.description = meeting.description.slice(0, meeting.description.length - 1); // there are duplicate trailing \n

            return meeting;
        }).filter(meeting => meeting !== null);

        // remove duplicate meetings
        for (let meeting of meetings) {
            if (meeting.delete) continue;
            for (let _meeting of meetings) {
                if (_meeting === meeting) {
                    continue;
                }
                let duplicate = meeting.zid === _meeting.zid
                    && meeting.day === _meeting.day
                    && meeting.time24h === _meeting.time24h

                if (duplicate) {
                    _meeting.delete = true;
                }
            }
        }

        meetings = meetings.filter(meeting => !meeting.delete);

        const _meetings = meetings.map(_meeting => {
            const meeting = new Meeting({
                uid: 'apple|000319.aff12d49c69443ca9abd867a8eb185cc.0259',

                homeUrl: 'https://virtual-na.org/meetings/',
                sourceUrl: 'https://virtual-na.org/meetings/',

                group: '',
                groupType: 'NA',
                continuous: false,

                timezone: DateTime.now().zoneName,    // Must be tz as what downloaded data is from

                meetingTypes: _meeting.types,
                meetingUrl: _meeting.href,
                name: _meeting.name,
                description: _meeting.description,

                password: _meeting.password,
                _password: _meeting._password,
                language: _meeting.language,
                location: _meeting.address,

                duration: _meeting.duration,
                time24h: _meeting.time24h,
                recurrence: _meeting.recurrence,
                closed: _meeting.closed,
                zid: _meeting.zid,
            });

            meeting.update();
            meeting.iid = `virtual-na.org:${meeting.zid}:${meeting.startTime}:${meeting.startDateTime}`;

            return meeting;
        });

        console.log(meetings);
        return _meetings;
    }
}