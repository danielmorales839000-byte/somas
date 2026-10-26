import test from 'node:test';
import assert from 'node:assert/strict';
import {googleFailure} from '../src/google.js';
import {googleStatus} from '../public/exhibition/google-status.js';
test('Google failures distinguish disabled API, permission, renewal, missing calendar and rate limit without exposing provider messages',()=>{
 assert.equal(googleFailure(403,{error:{errors:[{reason:'accessNotConfigured'}]}}),'google_api_not_enabled');
 assert.equal(googleFailure(403,{error:{details:[{reason:'SERVICE_DISABLED'}]}}),'google_api_not_enabled');
 assert.equal(googleFailure(403,{error:{errors:[{reason:'rateLimitExceeded'}]}}),'google_rate_limited');
 assert.equal(googleFailure(403),'google_permission_denied');assert.equal(googleFailure(401),'google_reconnect_required');assert.equal(googleFailure(404),'google_calendar_not_found');assert.equal(googleFailure(500,{error:{message:'private token'}}),'google_service_unavailable');assert(!googleStatus(googleFailure(500)).includes('private token'));assert(googleStatus('google_permission_denied').includes('required permissions'));
});
