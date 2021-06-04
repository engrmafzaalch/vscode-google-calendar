const vscode = require('vscode');
const authenticate = require('./src/js/authenticate')
const TokenManager = require("./src/js/TokenManager");
const axios = require('axios');
let toggleBtn;
let sync = true;
let events = []
let startTimeout, upcomingTimeout;
let calendars = []

function activate(context) {

	TokenManager.globalState = context.globalState
	TokenManager.setToken(undefined, undefined, undefined)
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

					syncEvents(ID_TOKEN, REFRESH_TOKEN, () => {
						toggleBtn.text = `$(calendar) Up-to-date`
					})

				} else {

					toggleBtn.text = `$(calendar) is OFF`

				}
			} else {

				try {
					vscode.window.showInformationMessage('Auth')
					authenticate(() => {

						ACCESS_TOKEN = TokenManager.getToken().ACCESS_TOKEN_KEY
						ID_TOKEN = TokenManager.getToken().ID_TOKEN_KEY
						REFRESH_TOKEN = TokenManager.getToken().REFRESH_TOKEN_KEY

						syncEvents(ID_TOKEN, REFRESH_TOKEN, () => {

							toggleBtn.text = `$(calendar) Up-to-date`

						})
					});
				} catch (err) {
					showError()
				}
			}
		})

	toggleBtn.text = `$(calendar) Signin`
	toggleBtn.command = toggleBtnID
	toggleBtn.color = '#ccc'
	toggleBtn.show();

	/* CHECK IF SIGNED IN THEN FETCH EVENTS */
	if (ID_TOKEN) {

		syncEvents(ID_TOKEN, REFRESH_TOKEN, () => {
			toggleBtn.text = `$(calendar) Up-to-date`
		});

	}
}



function fetchEvents(ID_TOKEN, REFRESH_TOKEN, cb) {

	toggleBtn.text = `$(calendar) Syncing`
	fetchCalendars(ID_TOKEN, REFRESH_TOKEN, (cIds) => {

		const requests = []
		cIds.forEach(calendarId => {
			requests.push(axios.post(`https://vscode-google-calendar.herokuapp.com/events?idToken=${ID_TOKEN}&refreshToken=${REFRESH_TOKEN}`, {
				calendarId: calendarId
			}))
		})

		axios.all(requests).then(axios.spread((...responses) => {

			responses.forEach(res => {
				events.push(...res.data.events)
			})

			const eventCount = events.length

			/* Events are being listed from different calendars so are beng sorted manually */
			events.sort(function (x, y) {
				return new Date(x.start.dateTime).getTime() - new Date(y.start.dateTime).getTime();
			})


			/* SETUP ARE RECURSIVE FUNCTION TO MAKE SURE
			1. SHOW REMINDER MESSAGES FOR NEXT EVENT
			2. WHEN NEXT EVENT COMPLETED POP THAT EVENT AND GO TO STEP.1 */
			if (events.length)
				eventsQueue()


			vscode
				.window
				.showInformationMessage(`You have ${eventCount} Events left for today on your calendar!`)
			cb()

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

	let nextEvent = events[0]
	let nextEventTime = nextEvent.start.dateTime
	let nextEventEndTime = nextEvent.end.dateTime
	let link = nextEvent.hangoutLink
	nextEventTime = new Date(nextEventTime).getTime()
	nextEventEndTime = new Date(nextEventEndTime).getTime()

	let timeNow = new Date().getTime()

	let meetingTime = nextEventTime - timeNow

	startTimeout = setTimeout(() => {
		clearTimeout(startTimeout)
		events.splice(0, 1)
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

function syncEvents(ID_TOKEN, REFRESH_TOKEN, cb) {

	fetchEvents(ID_TOKEN, REFRESH_TOKEN, () => {
		cb()
	})

}
function fetchCalendars(ID_TOKEN, REFRESH_TOKEN, cb) {

	if (calendars.length) return cb(calendars)
	axios.get(`https://vscode-google-calendar.herokuapp.com/calendar-list?idToken=${ID_TOKEN}&refreshToken=${REFRESH_TOKEN}`).then(res => {
		calendars = res.data.calendarIds
		cb(calendars)
	}).catch(err => {
		showError()
	})
}

function showError() {
	vscode.window.showErrorMessage('Unable to Sync with your calendar. Something Went wroing! ')
}

module.exports = {
	activate
}