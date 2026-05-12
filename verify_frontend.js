const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Mock Tauri API
  await page.addInitScript(() => {
    window.__TAURI__ = {
      core: {
        invoke: async (cmd, args) => {
          if (cmd === 'get_props') {
            return {
              paypal: 'https://paypal.me/Zarhkoh',
              langues: {
                fr: {
                  label: '🇫🇷 Français', historias: 150, musiques: 150,
                  urls: { histoires: 'https://mega.nz/1', musiques: 'https://mega.nz/2' }
                }
              }
            };
          }
          if (cmd === 'list_sd') {
            return [
              { path: '/dev/sdb1', letter: 'E', label: 'SD_DISNEY', used: 2147483648, total: 15938355200, display: 'E: SD_DISNEY 2.0 Go / 14.8 Go' }
            ];
          }
          if (cmd === 'create_sd') return { success: true };
          return {};
        }
      },
      event: {
        listen: async (event, cb) => {
          window.addEventListener(event, (e) => cb({ payload: e.detail }));
          return () => {};
        }
      },
      window: {
        getCurrent: () => ({ minimize: () => {}, close: () => {} })
      }
    };
  });

  const indexPath = 'file://' + path.resolve('src/renderer/index.html');
  await page.goto(indexPath);

  // 1. Selection Page
  await page.waitForSelector('#sd-select option');
  await page.screenshot({ path: '1_selection.png' });

  // Select SD and start
  await page.selectOption('#sd-select', '/dev/sdb1');
  await page.click('#start-btn');
  await page.waitForSelector('#confirm-overlay:not(.hidden)');
  await page.screenshot({ path: '2_confirm.png' });

  // Confirm and show progress
  await page.click('#confirm-ok');

  await page.evaluate(() => {
     window.dispatchEvent(new CustomEvent('pipeline:update', {
       detail: { step: 0, state: 'active', detail: '45%', stepPct: 45 }
     }));
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: '3_download.png' });

  await page.evaluate(() => {
     window.dispatchEvent(new CustomEvent('pipeline:update', {
       detail: { step: 3, state: 'active', detail: '120/150', stepPct: 80 }
     }));
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: '4_copy.png' });

  // Success
  await page.evaluate(() => {
      document.getElementById('steps-list').style.display = 'none';
      document.getElementById('success-screen').style.display = 'flex';
      document.getElementById('footer-prog').style.display = 'flex';
      document.querySelector('.prog-header').style.display = 'none';
      document.querySelector('.total-bar-wrap').style.display = 'none';
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: '5_success.png' });

  await browser.close();
})();
