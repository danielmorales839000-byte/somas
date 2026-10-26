import test from 'node:test';
import assert from 'node:assert/strict';
import {detailRows,adminMarkup} from '../public/exhibition/admin-ui.js';
test('admin detail rows escape untrusted labels and values',()=>{
 const html=detailRows({'<script>':'<img src=x onerror=alert(1)>','Missing':null});
 assert(!html.includes('<script>'));assert(!html.includes('<img'));assert(html.includes('&lt;img'));assert(html.includes('Not recorded'));
});
test('admin workspace retains searchable record tabs and no metric card container',()=>{
 const html=adminMarkup();for(const tab of ['users','messages','feedback','meetings','calendar'])assert(html.includes('data-admin-tab="'+tab+'"'));
 assert(html.includes('admin-search'));assert(!html.includes('admin-summary'));assert(!html.includes('daily-bars'));
});
