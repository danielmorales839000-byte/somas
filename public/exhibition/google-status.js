export function googleStatus(code){return ({
 google_api_not_enabled:'A required Google API is disabled for the connected Cloud project. The organizer needs to enable Google Calendar API and Gmail API.',
 google_permission_denied:'Google denied access. The organizer needs to reconnect Gmail & Calendar, approve the required permissions, and check access to the selected calendar.',
 google_calendar_not_found:'The selected Google Calendar could not be found. The organizer needs to check GOOGLE_CALENDAR_ID or use primary.',
 google_rate_limited:'Google temporarily limited calendar requests. Please wait a moment, then refresh availability.',
 google_reconnect_required:'The Google authorization needs renewal. The organizer needs to reconnect Gmail & Calendar.',
 google_not_connected:'The organizer has not connected Google Calendar yet.',
 booking_hours_not_configured:'The organizer has not saved meeting hours yet.',
 calendar_access_unavailable:'The connected account cannot read the selected calendar. The organizer needs to check calendar access.',
 google_service_unavailable:'Google Calendar could not respond. Please refresh shortly. If this continues, the organizer needs to test the connection.'
 })[code]||'';}
