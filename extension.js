const vscode = require('vscode');
const authenticate = require('./src/js/authenticate')
const TokenManager = require("./src/js/TokenManager");
const { TreeDataProvider } = require('./src/js/TreeController')
const axios = require('axios');

let toggleBtn;
let sync = true;
let events = {}
let startTimeout, upcomingTimeout, timeRemainingTimeout;
let calendars = []
let currentDate = new Date()
var options = { year: 'numeric', month: 'numeric', day: 'numeric' };
const daysToFetch = 7
const currentDateFormatted = currentDate
	.toLocaleDateString('en-US', options)
	.split('/')
	.join('-');


function activate(context) {



	TokenManager.globalState = context.globalState
	// TokenManager.setToken('', '', '')


	let ID_TOKEN = TokenManager.getToken().ID_TOKEN_KEY
	let REFRESH_TOKEN = TokenManager.getToken().REFRESH_TOKEN_KEY

	toggleBtn = vscode
		.window.
		createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	const toggleBtnID = 'google-calendar-inegration.toggleCalendar';

	vscode
		.commands
		.registerCommand(toggleBtnID, () => {
			if (ID_TOKEN) {
				sync = !sync
				if (sync) {
					syncEvents(ID_TOKEN, REFRESH_TOKEN)
				} else {
					events = {}
					vscode.window.registerTreeDataProvider(
						'upcoming-events',
						new TreeDataProvider(events),

					);
					toggleBtn.text = `$(calendar) is OFF`

				}
			} else {

				auth()
			}
		})

	vscode.commands.registerCommand('upcoming-events.refreshEntry', () =>
		syncEvents(ID_TOKEN, REFRESH_TOKEN)
	);
	vscode.commands.registerCommand('upcoming-events.openEntry', (el) => {
		vscode.commands.executeCommand(
			"vscode.open",
			vscode.Uri.parse(el.event.htmlLink)
		);
	}
	);

	toggleBtn.text = `$(calendar) Signin`
	toggleBtn.command = toggleBtnID
	toggleBtn.color = '#ccc'
	toggleBtn.show();

	/* CHECK IF SIGNED IN THEN FETCH EVENTS */
	if (ID_TOKEN) {

		syncEvents(ID_TOKEN, REFRESH_TOKEN)

	} else {
		auth()
	}
}


function fetchEvents(ID_TOKEN, REFRESH_TOKEN, cb) {

	toggleBtn.text = `$(calendar) Syncing`
	fetchCalendars(ID_TOKEN, REFRESH_TOKEN, async (cIds) => {
		events = {}
		const requests = []
		cIds.forEach(calendarId => {
			requests.push(axios.post(`https://vscode-google-calendar.herokuapp.com/events?idToken=${ID_TOKEN}&refreshToken=${REFRESH_TOKEN}`, {
				calendarId: calendarId,
				days: daysToFetch,
				currentDate: new Date().toISOString()
			}))

		})


		axios.all(requests).then(axios.spread((...responses) => {

			responses.forEach(res => {
				for (let key in res.data.events) {
					if (!events[key]) {
						events[key] = res.data.events[key]
					} else {
						res.data.events[key].length && events[key].push(...res.data.events[key])

					}

				}
			})

			/* Events are being listed from different calendars so are beng sorted manually */
			for (let date in events) {
				events[date].sort(function (x, y) {
					return new Date(x.start.dateTime).getTime() - new Date(y.start.dateTime).getTime();
				})
			}
			const eventCount = events[currentDateFormatted].length
			if (eventCount)
				vscode
					.window
					.showInformationMessage(`You have ${eventCount} Events left for today on your calendar!`)
			else
				vscode.window.showInformationMessage('Hurry! No event left for today')

			/* SETUP ARE RECURSIVE FUNCTION TO MAKE SURE
			1. SHOW REMINDER MESSAGES FOR NEXT EVENT
			2. WHEN NEXT EVENT COMPLETED POP THAT EVENT AND GO TO STEP.1 */
			// if (events.length)
			eventsQueue()
			cb(events)

		})).catch(errors => {
			showError()

		})

	})

}

function showMeetingMsg(link, title) {

	if (link)
		vscode.window
			.showInformationMessage('You have an Event: ' + title, ...['Join Meeting'])
			.then(selection => {
				if (selection == 'Join Meeting') {
					vscode.commands.executeCommand(
						"vscode.open",
						vscode.Uri.parse(link)
					);
				}
			});
	else
		vscode.window.showInformationMessage('You have an Event: ' + title)
}

function eventsQueue() {
	let nextEvent = events[currentDateFormatted][0]
	if (!nextEvent) {
		/*IF THERE IS NO EVENT FOR TODAY THEN WE WILL SYNC AGAIN WHEN DATE WILL CHANGE */
		var actualTime = new Date(Date.now());
		var endOfDay = new Date(actualTime.getFullYear(), actualTime.getMonth(), actualTime.getDate() + 1, 0, 0, 0);
		var timeRemaining = endOfDay.getTime() - actualTime.getTime();
		timeRemainingTimeout = setTimeout(() => {
			syncEvents()
			clearTimeout(timeRemainingTimeout)
		}, timeRemaining)
		return
	}
	clearTimeout(timeRemainingTimeout)

	let nextEventTime = nextEvent.start.dateTime
	let nextEventEndTime = nextEvent.end.dateTime
	let link = nextEvent.hangoutLink
	nextEventTime = new Date(nextEventTime).getTime()
	nextEventEndTime = new Date(nextEventEndTime).getTime()

	let timeNow = new Date().getTime()

	let meetingTime = nextEventTime - timeNow

	startTimeout = setTimeout(() => {
		clearTimeout(startTimeout)
		events[currentDateFormatted].splice(0, 1)
		showMeetingMsg(link, nextEvent.summary)
		eventsQueue()
	}, meetingTime)

	let reminderTime = 5 //5 mins
	upcomingTimeout = setTimeout(() => {
		vscode.window.showInformationMessage(`You have an Event: ${nextEvent.summary} in 
		${new Date(meetingTime).getMinutes()} mins`)
		clearTimeout(upcomingTimeout)
	}, (new Date(meetingTime).getMinutes() < reminderTime && new Date(meetingTime).getMinutes() > 0) ? 0 : nextEventTime - new Date(new Date().getTime() + (reminderTime * 60000)))
}

function syncEvents(ID_TOKEN, REFRESH_TOKEN) {

	fetchEvents(ID_TOKEN, REFRESH_TOKEN, (events) => {
		vscode.window.registerTreeDataProvider(
			'upcoming-events',
			new TreeDataProvider(events),

		);

		toggleBtn.text = `$(calendar) Up-to-date`

	})

}

function fetchCalendars(ID_TOKEN, REFRESH_TOKEN, cb) {
	if (calendars.length) return cb(calendars)
	axios.get(`https://vscode-google-calendar.herokuapp.com/calendar-list?idToken=${ID_TOKEN}&refreshToken=${REFRESH_TOKEN}`).then(res => {
		calendars = res.data.calendarIds
		cb(calendars)
	}).catch(err => {
		console.error(err)
		if (err.response.status === 403) {
			auth()
		} else
			showError()
	})
}



function showError() {
	vscode.window.showErrorMessage('Unable to Sync with your calendar. Something Went wroing! ')
}

function auth() {
	try {
		vscode.window.showInformationMessage('Auth')
		authenticate(() => {

			// ACCESS_TOKEN = TokenManager.getToken().ACCESS_TOKEN_KEY
			let ID_TOKEN = TokenManager.getToken().ID_TOKEN_KEY
			let REFRESH_TOKEN = TokenManager.getToken().REFRESH_TOKEN_KEY
			syncEvents(ID_TOKEN, REFRESH_TOKEN)
		});
	} catch (err) {
		showError()
	}
}
module.exports = {
	activate
}
