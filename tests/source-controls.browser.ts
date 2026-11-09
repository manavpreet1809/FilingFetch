import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { UarbClient } from '../src/uarb/client.js';
import { readConfig } from '../src/config.js';

test('source client navigates and opens attachments when source buttons have undefined accessible labels', async () => {
 const browser=await chromium.launch(); const newPage=browser.newPage.bind(browser);
 const launch=mock.method(chromium,'launch',async()=>browser);
 const pageFactory=mock.method(browser,'newPage',async(options)=>{
  const page=await newPage(options);
  await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:`
   <div class="inner_border"><span>eg M01234</span><div class="text" contenteditable="true"></div></div>
   <button id="b0p0o258i0i0r1">Search</button>
   ${['Exhibits - 0','Key Documents - 1','Other Documents - 0','Transcripts - 0','Recordings - 0'].map(text=>`<button aria-label="undefined">${text}</button>`).join('')}
   <div class="fm_object_219">M12205</div><div id="b0p0o223i0i0r1">Synthetic source matter</div>
   ${[222,220,231,225,227,228].map(id=>`<div class="fm_object_${id}"></div>`).join('')}
   <div class="v-loading-indicator" style="display:none"></div>
   <table role="grid" aria-rowcount="1"><tr class="v-grid-row-has-data"><td>
   <span class="fm_object_268" id="doc-1">1</span><span class="fm_object_202">Synthetic filing</span>
   <span class="fm_object_204">Public</span><span class="fm_object_284">txt</span>
   <button aria-label="undefined" onclick="document.querySelector('#dialog').style.display='block'">GO GET IT</button>
   </td></tr></table>
   <div id="dialog" style="display:none"><span>Download Files</span><button class="fm-download-button">synthetic.txt</button>
   <div role="button" tabindex="0" onclick="document.querySelector('#dialog').style.display='none'">Close</div></div>
  `}));
  return page;
 });
 const client=new UarbClient(readConfig({CACHE_BACKEND:'off',STEP_TIMEOUT_MS:'1000'}),'/unused');
 try {
  const matter=await client.open({matterNumber:'M12205',documentType:'Key Documents',limit:1});
  assert.equal(matter.title,'Synthetic source matter'); assert.equal(matter.counts['Key Documents'],1);
  const docs=await client.visibleDocuments(); assert.equal(docs.length,1);
  assert.deepEqual(await client.openAttachments(docs[0]!),['synthetic.txt']);
  await client.closeAttachments();
  assert.equal(await (client as any).page.getByText('Download Files', {exact:true}).isVisible(), false);
 } finally { await client.close(); await client.closeAttachments(); pageFactory.mock.restore(); launch.mock.restore(); }
});
