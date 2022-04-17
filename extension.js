const vscode = require('vscode')
const { authenticate, renewTokens } = require('./src/js/authenticate')
const TokenManager = require('./src/js/TokenManager')
const { TreeDataProvider } = require('./src/js/TreeController')
const axios = require('axios')
const ACCESS_TOKEN_KEY = 'vs-gcalendar-access'
const ID_TOKEN_KEY = 'vs-gcalendar-id'
const REFRESH_TOKEN_KEY = 'vs-gcalendar-refresh'
const BASE_URL = 'https://vscode-google-calendar.herokuapp.com/'
let toggleBtn
let sync = true
let events = {}
let startTimeout, upcomingTimeout, timeRemainingTimeout
let calendars = []
let currentDate = new Date()
var options = { year: 'numeric', month: 'numeric', day: 'numeric' }
let ID_TOKEN = '',
  ACCESS_TOKEN = '',
  REFRESH_TOKEN = ''
const daysToFetch = 7
let context = null
const currentDateFormatted = currentDate
  .toLocaleDateString('en-US', options)
  .split('/')
  .join('-')

function activate(_context) {
  context = _context
  TokenManager.globalState = context.globalState

  ID_TOKEN = TokenManager.getToken()[ID_TOKEN_KEY]
  REFRESH_TOKEN = TokenManager.getToken()[REFRESH_TOKEN_KEY]
  ACCESS_TOKEN = TokenManager.getToken()[ACCESS_TOKEN_KEY]
  console.log(REFRESH_TOKEN)
  console.log(ACCESS_TOKEN)

  toggleBtn = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  )
  const toggleBtnID = 'google-calendar-inegration.toggleCalendar'

  vscode.commands.registerCommand(toggleBtnID, () => {
    if (ID_TOKEN) {
      sync = !sync
      if (sync) {
        syncEvents(ID_TOKEN, REFRESH_TOKEN)
      } else {
        events = {}
        vscode.window.registerTreeDataProvider(
          'upcoming-events',
          new TreeDataProvider(events)
        )
        toggleBtn.text = `$(calendar) is OFF`
      }
    } else {
      console.log('60 auth')
      auth()
    }
  })

  vscode.commands.registerCommand('upcoming-events.refreshEntry', () =>
    syncEvents(ID_TOKEN, REFRESH_TOKEN)
  )
  vscode.commands.registerCommand('upcoming-events.openEntry', (el) => {
    vscode.commands.executeCommand(
      'vscode.open',
      vscode.Uri.parse(el.event.htmlLink)
    )
  })

  toggleBtn.text = `$(calendar) Signin`
  toggleBtn.command = toggleBtnID
  toggleBtn.color = '#ccc'
  toggleBtn.show()

  /* CHECK IF SIGNED IN THEN FETCH EVENTS */
  if (ID_TOKEN) {
    syncEvents(ID_TOKEN, REFRESH_TOKEN)
  } else {
    console.log('84 auth')
    auth()
  }
}

function fetchEvents(ID_TOKEN, REFRESH_TOKEN, cb) {
  toggleBtn.text = `$(calendar) Syncing`
  fetchCalendars(ID_TOKEN, REFRESH_TOKEN, async (cIds) => {
    events = {}
    const requests = []
    cIds.forEach((calendarId) => {
      requests.push(
        axios.post(
          `${BASE_URL}events?idToken=${ID_TOKEN}&refreshToken=${REFRESH_TOKEN}&accessToken=${ACCESS_TOKEN}`,
          {
            calendarId: calendarId,
            days: daysToFetch,
            currentDate: new Date().toISOString(),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }
        )
      )
    })
    axios
      .all(requests)
      .then(
        axios.spread((...responses) => {
          responses.forEach((res) => {
            for (let key in res.data.events) {
              if (!events[key]) {
                events[key] = res.data.events[key]
              } else {
                res.data.events[key].length &&
                  events[key].push(...res.data.events[key])
              }
            }
          })
          /* Events are being listed from different calendars so are beng sorted manually */
          for (let date in events) {
            events[date].sort(function (x, y) {
              return (
                new Date(x.start.dateTime).getTime() -
                new Date(y.start.dateTime).getTime()
              )
            })
          }
          const eventCount = events[currentDateFormatted].length
          if (eventCount)
            vscode.window.showInformationMessage(
              `You have ${eventCount} Events left for today on your calendar!`
            )
          else
            vscode.window.showInformationMessage(
              'Hurry! No event left for today'
            )

          /* SETUP ARE RECURSIVE FUNCTION TO MAKE SURE
    	1. SHOW REMINDER MESSAGES FOR NEXT EVENT
    	2. WHEN NEXT EVENT COMPLETED POP THAT EVENT AND GO TO STEP.1 */
          if (events.length) eventsQueue()
          cb(events)
        })
      )
      .catch((errors) => {
        showError()
      })
  })
}

function showMeetingMsg(link, title, from, to) {
  if (link)
    vscode.window
      .showInformationMessage(
        'You have an Event: ' + title + (from ? ` Time: ${from}-${to}` : ''),
        ...['Join Meeting']
      )
      .then((selection) => {
        if (selection == 'Join Meeting') {
          vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(link))
        }
      })
  else
    vscode.window.showInformationMessage(
      'You have an Event: ' + title + ` Time: ${from}-${to}`
    )
}

function eventsQueue() {
  let nextEvent = events[currentDateFormatted][0]
  if (!nextEvent) {
    /*IF THERE IS NO EVENT FOR TODAY THEN WE WILL SYNC AGAIN WHEN DATE WILL CHANGE */
    var actualTime = new Date(Date.now())
    var endOfDay = new Date(
      actualTime.getFullYear(),
      actualTime.getMonth(),
      actualTime.getDate() + 1,
      0,
      0,
      0
    )
    var timeRemaining = endOfDay.getTime() - actualTime.getTime()
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
  if (nextEventTime < timeNow && nextEventEndTime > timeNow) {
    const from = new Date(nextEvent.start.dateTime).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })
    const to = new Date(nextEvent.end.dateTime).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })

    showMeetingMsg(nextEvent.hangoutLink, nextEvent.summary, from, to)
    events[currentDateFormatted].splice(0, 1)
    setTimeout(() => {
      eventsQueue()
    }, nextEventEndTime - timeNow)
    return
  }

  let meetingTime = nextEventTime - timeNow

  startTimeout = setTimeout(() => {
    clearTimeout(startTimeout)
    events[currentDateFormatted].splice(0, 1)
    const from = new Date(nextEvent.start.dateTime).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })
    const to = new Date(nextEvent.end.dateTime).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })

    showMeetingMsg(link, nextEvent.summary, from, to)
    eventsQueue()
  }, meetingTime)

  let reminderTime = 5 //5 mins

  let mettingInLessThenReminderTime =
    new Date(meetingTime).getMinutes() < reminderTime && meetingTime > 0
  let reminderTimeRemaining =
    nextEventTime -
    new Date(new Date().getTime() + reminderTime * 60000).getTime()

  upcomingTimeout = setTimeout(
    () => {
      const meetingIn = Math.ceil(
        (new Date(nextEventTime).getTime() - new Date().getTime()) / 60000
      )
      vscode.window.showInformationMessage(
        `You have an Event: ${nextEvent.summary}` +
          (isNaN(meetingIn) ? '' : ' in ' + meetingIn + ' mins ')
      )
      clearTimeout(upcomingTimeout)
    },
    mettingInLessThenReminderTime ? 0 : reminderTimeRemaining
  )
}

function syncEvents(ID_TOKEN, REFRESH_TOKEN) {
  'syncing'
  fetchEvents(ID_TOKEN, REFRESH_TOKEN, (events) => {
    vscode.window.registerTreeDataProvider(
      'upcoming-events',
      new TreeDataProvider(events)
    )

    toggleBtn.text = `$(calendar) Up-to-date`
  })
}

function fetchCalendars(ID_TOKEN, REFRESH_TOKEN, cb) {
  if (calendars.length) return cb(calendars)

  axios
    .get(
      `${BASE_URL}calendar-list?idToken=${ID_TOKEN}&refreshToken=${REFRESH_TOKEN}&accessToken=${ACCESS_TOKEN}`
    )
    .then((res) => {
      calendars = res.data.calendarIds
      cb(calendars)
    })
    .catch((err) => {
      if (err.response && err.response.status === 403) {
        auth()
      } else showError()
    })
}

function showError() {
  vscode.window.showErrorMessage(
    'Unable to Sync with your calendar. Something Went wrong! '
  )
}

function renewAuthTokens(cb) {
  renewTokens(BASE_URL, REFRESH_TOKEN, (success)=>{
    if(success){

      ID_TOKEN = TokenManager.getToken()[ID_TOKEN_KEY]
      REFRESH_TOKEN = TokenManager.getToken()[REFRESH_TOKEN_KEY]
      ACCESS_TOKEN = TokenManager.getToken()[ACCESS_TOKEN_KEY]
      
      context.globalState[ACCESS_TOKEN_KEY] = ACCESS_TOKEN
      context.globalState[ID_TOKEN_KEY] = ID_TOKEN
      context.globalState[REFRESH_TOKEN_KEY] = REFRESH_TOKEN
      cb()
    }else{
      TokenManager.setToken(null, null, null)
      auth()
    }
  })
   
}

function auth() {
  try {
    vscode.window.showInformationMessage('Authenticating...')
    if (REFRESH_TOKEN) {
      renewAuthTokens(()=>{
        syncEvents(ID_TOKEN, REFRESH_TOKEN)
      })
    } else {
      TokenManager.setToken(null, null, null)
      authenticate(() => {
        ID_TOKEN = TokenManager.getToken()[ID_TOKEN_KEY]
        REFRESH_TOKEN = TokenManager.getToken()[REFRESH_TOKEN_KEY]
        ACCESS_TOKEN = TokenManager.getToken()[ACCESS_TOKEN_KEY]

        context.globalState[ACCESS_TOKEN_KEY] = ACCESS_TOKEN
        context.globalState[ID_TOKEN_KEY] = ID_TOKEN
        context.globalState[REFRESH_TOKEN_KEY] = REFRESH_TOKEN
        syncEvents(ID_TOKEN, REFRESH_TOKEN)
      })
    }
  } catch (err) {
    showError()
  }
}
module.exports = {
  activate,
}
