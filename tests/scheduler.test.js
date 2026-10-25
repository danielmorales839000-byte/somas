import test from 'node:test';
import assert from 'node:assert/strict';
import {monthCells} from '../public/exhibition/scheduler.js';
test('calendar month grid aligns Mondays and remains sequential across year boundaries',()=>{const rows=monthCells(2026,9);assert.equal(rows.length,42);assert.equal(new Date(rows[0].date).getUTCDay(),1);assert.equal(rows.filter(x=>x.inMonth).length,31);assert.equal(rows.find(x=>x.date==='2026-10-01').day,1);for(let i=1;i<rows.length;i++)assert.equal(Date.parse(rows[i].date)-Date.parse(rows[i-1].date),86400000);const december=monthCells(2026,11);assert(december.some(x=>x.date.startsWith('2027-01')));});
