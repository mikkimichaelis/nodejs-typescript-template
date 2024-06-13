import { DateTime } from 'luxon';
import { Browser, Page } from "puppeteer";
import { languageData } from "./shared/data/language-codes";
import { Meeting } from './shared/models/meeting';

const TIMING = 300;         // mills it takes to open a page in this environment.
const FULL_SCROLL = true;  // use first page of results or scroll to bottom? (slow af)

export const scraperObject = {
    async scraper(browser: Browser, weekday: string) {
        if ((await browser.pages()).length !== 1) throw new Error('STALE PAGES');
        const url = `https://aa-intergroup.org/meetings/?tags=${weekday}`;
        let page: Page = await browser.newPage();
        console.log(`Navigating to ${url}...`);
        await page.goto(url);

        // Wait for the required DOM to be rendered
        await page.waitForSelector('#root > main > section > div');

        if (FULL_SCROLL) {
            console.log(`scroll start: ${DateTime.now().toLocaleString(DateTime.TIME_24_SIMPLE)}`)
            await page.evaluate(async () => {
                const distance = 1000;
                const delay = 100;
                const scroll: any = document.scrollingElement;
                while (scroll.scrollTop + window.innerHeight < scroll.scrollHeight) {
                    scroll.scrollBy(0, distance);
                    await new Promise(resolve => { setTimeout(resolve, delay); });
                }
            });
            console.log(`scroll end: ${DateTime.now().toLocaleString(DateTime.TIME_24_SIMPLE)}`)
        } else {
            console.log('Skipping scroll...')
        }

        let meetings: any[] = await page.$$eval('#root > main > section > div > div > article', (meetings) => {
            return meetings.map(meeting => {
                const name = meeting.querySelector('.chakra-heading.css-i2k2yg > a')?.textContent || '';
                const day_time = meeting.querySelector('.css-1kg07oq > h3')?.textContent || '';
                const day = day_time.split(' ')[0];
                const time = day_time.replace(day, '').trim();  // 12h
                const type_nodes = meeting.querySelectorAll('.css-6c125o');
                const types: any[] = [];
                type_nodes.forEach((node: Element) => types.push(node.textContent));

                // get the join zoom button.  we will use the below cssPath to save the full button selector
                // for later use when actually finding and clicking the button to extract the zoomid/pw
                const button = meeting.querySelector('.chakra-stack.css-gsc7pt > div > button') as Element;

                return {
                    button_path: cssPath(button),
                    day,
                    time,
                    name,
                    types,
                    password: '',
                    _password: '',
                    start: 0,
                    end: 0,
                    duration: 0,
                    time24h: '00:00',
                    recurrence: {},
                    language: '',
                    zid: '',
                    closed: false,
                    description: '',
                    delete: false
                }
            });

            function cssPath(el: Element) {
                if (!(el instanceof Element)) return;
                var path = [];
                while (el.nodeType === Node.ELEMENT_NODE) {
                    var selector = el.nodeName.toLowerCase();
                    if (el.id) {
                        selector += '#' + el.id;
                        path.unshift(selector);
                        break;
                    } else {
                        var sib: any = el,
                            nth = 1;
                        while ((sib = sib.previousElementSibling)) {
                            if (sib.nodeName.toLowerCase() == selector) nth++;
                        }
                        if (nth != 1) selector += ':nth-of-type(' + nth + ')';
                    }
                    path.unshift(selector);
                    el = el.parentNode as any;
                }
                return path.join(' > ');
            }
        });

        // filter out all non zoom meetings
        meetings = meetings.filter(meeting => meeting.types.includes('Zoom'));

        // convert meeting types
        meetings = meetings.map(meeting => {
            meeting.meetingTypes = [];
            meeting.types.forEach((type: any) => {
                // TODO this should be updated to just search meetingTypes...
                switch (type) {
                    case 'Open':
                        meeting.close = false;
                        meeting.meetingTypes.push('O');
                        break;
                    case 'Closed':
                        meeting.close = true;
                        meeting.meetingTypes.push('C');
                        break;
                    case 'Discussion':
                        meeting.meetingTypes.push('D');
                        break;
                    case 'Young People':
                        meeting.meetingTypes.push('YP');
                        break;
                    case 'Speaker':
                        meeting.meetingTypes.push('SO');
                        break;
                    case 'LGBTQIAA+':
                        meeting.meetingTypes.push('LGBTQ2+');
                        break;
                    case 'Men':
                        meeting.meetingTypes.push('M');
                        break;
                    case 'Women':
                        meeting.meetingTypes.push('W');
                        break;
                    case 'Big Book':
                        meeting.meetingTypes.push('BB')
                }

                // if code is a language, find it
                const lang = languageData.codes.find(code => code.language === type);
                if (lang) {
                    meeting.language = lang.code;
                    return;
                }
            });

            return meeting;
        });

        // click each meeting zoom button
        for await (let meeting of meetings) {
            await new Promise(async (resolve, reject) => {
                try {
                    await page.click(meeting.button_path);
                } catch (e) {
                    debugger;
                }
                await new Promise(async (resolve_, reject_) => {
                    let success = false;
                    let retry = 0;
                    while (!success && retry < 10) {
                        success = await new Promise<any>((_resolve, _reject) => {
                            setTimeout(async () => {
                                try {
                                    let pages = await browser.pages();

                                    // check page failed to open
                                    if (pages.length < 3) {
                                        throw new Error('PAGE NOT OPEN');
                                    }

                                    // this catches the chrome error window popup
                                    while (pages.length > 3) {
                                        console.warn(`CLOSING PAGE ${pages[3].url()}`)
                                        await pages[3].close();
                                        pages = await browser.pages();
                                    }
                                    const _page = pages[2];

                                    const url = _page.url();
                                    if (!url.includes('zoom')) {
                                        await _page.close();
                                        throw Error(`NOT ZOOM PAGE ${url}`);
                                    }

                                    await _page.close();
                                    if ((await browser.pages()).length != 2) debugger

                                    meeting.url = url;
                                    let segments = url.split('/');
                                    meeting.zid = segments[segments.length - 1].split('?')[0]

                                    // patch and mark for deletion garbage
                                    meeting.zid = meeting.zid.replace('#success', '');
                                    if (meeting.zid === 'registration'
                                        || meeting.zid === 'zoomconference'
                                        || isNaN(Number.parseInt(meeting.zid))
                                        || meeting.zid.length < 9
                                        || meeting.zid.length > 11) {
                                        meeting.delete = true;
                                    }

                                    // extract pwd from url
                                    const i = url.indexOf('?pwd=');
                                    if (i !== -1) {
                                        meeting._password = url.substring(i + '?pwd='.length);
                                    }

                                    console.log(`zid: ${meeting.zid} pw: ${meeting._password}`)

                                    _resolve(true);
                                } catch (e: any) {
                                    if (e.message.startsWith('NOT ZOOM PAGE')) _reject(e)
                                    
                                    console.warn(`${e.message}`);
                                    retry = retry + 1;
                                    _resolve(false);
                                }
                            }, TIMING);
                        }).catch(e => reject_(e));
                    }
                    if (retry === 10) reject_(new Error('RETRY FAILURE'));
                    resolve_(true);
                }).catch(e => {
                    reject(e);
                });
                resolve(true);
            }).catch((e) => {
                console.warn(e.message);
                meeting = null;
            })

            if (!meeting) continue;

            // "07:00 PM
            meeting.time24h = convertTo24HourFormat(meeting.time);

            meeting.start = Meeting.makeFrom24h_That70sDateTime(meeting.time24h, DateTime.now().zoneName as string, meeting.day).toMillis();
            meeting.duration = 60;

            meeting.recurrence = {
                type: 'Weekly',
                weekly_day: meeting.day,
                weekly_days: [meeting.day]
            }

            meeting.description = ``;
            if (meeting.description.startsWith('\n')) meeting.description = meeting.description.slice(1);
            if (meeting.description.endsWith('\n')) meeting.description = meeting.description.slice(0, meeting.description.length - 1);
            if (meeting.description.endsWith('\n')) meeting.description = meeting.description.slice(0, meeting.description.length - 1); // there are duplicate trailing \n
        }

        // meetings = meetings.filter(meeting => meeting !== null);

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

        // convert updated meeting data into Meeting
        const _meetings = meetings.map(updated => {
            const meeting = new Meeting({
                uid: 'apple|000629.9713109cc2fc4f8c85d8f03342ae38a2.0354',

                homeUrl: 'https://aa-intergroup.org/meetings/',
                sourceUrl: 'https://aa-intergroup.org/meetings/',

                group: '',
                groupType: 'AA',
                continuous: false,

                timezone: DateTime.now().zoneName,    // Must be tz as what downloaded data is from

                meetingTypes: updated.meetingTypes,
                meetingUrl: updated.url,
                name: updated.name,
                description: updated.description,

                password: updated.password,
                _password: updated._password,
                language: updated.language,
                location: updated.address,

                duration: updated.duration,
                time24h: updated.time24h,
                recurrence: updated.recurrence,
                closed: updated.closed,
                zid: updated.zid,
            });

            meeting.update();
            meeting.iid = `aa-intergroup.org:${meeting.zid}:${meeting.startTime}:${meeting.startDateTime}`;

            return meeting;
        });

        await page.close();
        return _meetings;
    }
}

// https://stackoverflow.com/questions/15083548/convert-12-hour-hhmm-am-pm-to-24-hour-hhmm#:~:text=const%20time12to24%20%3D%20(time12)%20%3D,24%2Dhour%20format%20time%20string.
function convertTo24HourFormat(time12h: string) {
    const dt = `${DateTime.now().toLocaleString(DateTime.DATE_SHORT)} ${time12h}`;
    var d = new Date(dt);
    return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
}

// ChatGPT
// in javascript write code to convert at 12h string into 24h format
// fucking garbage...
function _convertTo24HourFormat(time12h: any) {
    const [time, period] = time12h.split(' ');
    const [hours, minutes] = time.split(':');

    let convertedHours = parseInt(hours);
    if (period.toLowerCase() === 'pm' && convertedHours !== 12) {
        convertedHours += 12;
    } else if (period.toLowerCase() === 'am' && convertedHours === 12) {
        convertedHours = 0;
    }

    return `${convertedHours.toString().padStart(2, '0')}:${minutes}`;
}
