import {chromium} from 'playwright';
export async function connectDemo(){
  const browser=await chromium.connectOverCDP('http://127.0.0.1:19386');
  const page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().startsWith('app://obsidian.md'));
  if(!page)throw Error('Demo Obsidian is not running. Start test-welcome-host with AAEU_KEEP_OPEN=1.');
  const vault=await page.evaluate(()=>app.vault.adapter.getBasePath());
  if(!vault.replaceAll('\\','/').includes('/test-artifacts/launch-011'))throw Error('Refusing to control a non-demo vault');
  return {browser,page};
}
