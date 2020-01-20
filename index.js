const puppeteer = require('puppeteer');
const moment = require('moment');
const fs = require('fs-extra');
const pixelmatch = require('pixelmatch');
const PNG = require('pngjs').PNG;
const androidPixel2 = puppeteer.devices['Pixel 2'];

// ======================== プロジェクト別の設定 ========================
const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
const projectName = config.projectName;
const prodDomain = config.prdDomain;
const devDomain = config.devDomain;

// ローカルにあるキャプチャとローカルのdiffを取りたい場合に targetDir に 'screenshot/{projectname}/dev/20190603' みたいな感じに
// 本番とのdiffトル場合は空にしとく
//const targetDir = "screenshot/${projectName}/dev/2019603";
const targetDir = '';

const urls = config.urlList;
// ======================== / プロジェクト別の設定 ========================

// 遅延読み込み画像対応
async function scrollToBottom(page, viewportHeight) {
  const getScrollHeight = () => {
    return Promise.resolve(document.documentElement.scrollHeight) }

  let scrollHeight = await page.evaluate(getScrollHeight)
  let currentPosition = 0
  let scrollNumber = 0

  while (currentPosition < scrollHeight) {
    scrollNumber += 1
    const nextPosition = scrollNumber * viewportHeight
    await page.evaluate(function (scrollTo) {
      return Promise.resolve(window.scrollTo(0, scrollTo))
    }, nextPosition)
    await page.waitForNavigation({waitUntil: ['load', 'networkidle2'], timeout: 1000})
              .catch(e => console.log('timeout exceed. proceed to next operation'));
    currentPosition = nextPosition;
    scrollHeight = await page.evaluate(getScrollHeight)
  }
}

(async () => {
  const browser = await puppeteer.launch({
    //headless: false,
    ignoreHTTPSErrors: true,
  });
  const page = await browser.newPage();
  page.setViewport({width: 1200, height: 800});

  const date = moment().format('YYYYMDD');
  fs.mkdirs(`screenshot/${projectName}/dev/${date}`, function (err) {
    if(err) { console.log(err); return 1; }
  });
  fs.mkdirs(`screenshot/${projectName}/prod/${date}`, function (err) {
    if(err) { console.log(err); return 1; }
  });
  fs.mkdirs(`screenshot/${projectName}/diff/${date}`, function (err) {
    if(err) { console.log(err); return 1; }
  });

  for (let i = 0; i < urls.length; i++) {
    const name = urls[i][0]; // 画像の名前
    const devUrl = devDomain + urls[i][1]; // ローカル環境のURL
    const prodUrl = prodDomain + urls[i][1]; // 本番環境のURL
    const devCaptureSrc = `screenshot/${projectName}/dev/${date}/${name}.png`; // ローカル環境のキャプチャのパス
    const prodCaptureSrc = `screenshot/${projectName}/prod/${date}/${name}.png`; // 本番環境のキャプチャのパス
    const diffCaptureSrc = `screenshot/${projectName}/diff/${date}/${name}.png`; // diff画像の名前

    //await page.emulate(androidPixel2);

    // dev
    await page.goto(`${devUrl}`, {waitUntil: ['load', 'networkidle2']});
    await scrollToBottom(page, 800)
    await page.screenshot({
      path: devCaptureSrc,
      fullPage: true,
    });
    // prod
    if (!targetDir) {
      await page.goto(`${prodUrl}`, {waitUntil: ['load', 'networkidle2']});
      await scrollToBottom(page, 800)
      await page.screenshot({
        path: prodCaptureSrc,
        fullPage: true,
      });
    }

    const devCapture = await fs.createReadStream(devCaptureSrc).pipe(new PNG()); // ローカル環境のキャプチャ画像、pixelmatchで扱う用
    const prodCapture = await fs.createReadStream(prodCaptureSrc).pipe(new PNG()); // 本番環境のキャプチャ画像、pixelmatchで扱う用

    function createImageDiff(a, b) {
      return new Promise(resolve => {
        const img1 = fs
          .createReadStream(a)
          .pipe(new PNG())
          .on('parsed', doneReading)
        const img2 = fs
          .createReadStream(b)
          .pipe(new PNG())
          .on('parsed', doneReading)
        let filesRead = 0

        function doneReading() {
          if (++filesRead < 2) {
            return
          }
          const diff = new PNG({ width: img1.width, height: img1.height })
          const numDiffPixels = pixelmatch(
            img1.data,
            img2.data,
            diff.data,
            img1.width,
            img1.height,
            {
              threshold: 0.1
            }
          )
          diff.pack().pipe(fs.createWriteStream(diffCaptureSrc))
          const errorRate = numDiffPixels / (diff.width * diff.height)
          resolve({
            diffCaptureSrc,
            numDiffPixels,
            errorRate
          })
        }
      })
    }

    // diffを取るベースになるキャプチャを指定
    let baseCaptureSrc;
    if (targetDir !== '') {
      baseCaptureSrc = `${targetDir}/${name}.png`;
    } else {
      baseCaptureSrc = prodCaptureSrc;
    }

    createImageDiff(
      devCaptureSrc,
      baseCaptureSrc
    ).then(console.log)
  }

  await browser.close();
})();
