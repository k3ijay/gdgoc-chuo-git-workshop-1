import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { imageSize } from 'image-size';

const CONTENTS_DIR = path.resolve('contents');
const PUBLIC_DIR = path.resolve('public');
const MAX_IMAGE_BYTES = 2048 * 1024; // 2MB

let hasError = false;

function fail(file, message) {
  console.error(`NG: [${file}] ${message}`);
  hasError = true;
}

function pass(file, message) {
  console.log(`OK: [${file}] ${message}`);
}

function validatePRDiff() {
  const baseRef = process.env.GITHUB_BASE_REF || (process.argv.includes('--diff') ? 'main' : null);
  if (!baseRef) return;

  console.log(`--- PR 変更差分の検証 (対 ${baseRef}) ---`);
  let diffOutput = '';
  try {
    diffOutput = execSync(`git diff --name-status origin/${baseRef}...HEAD`, { encoding: 'utf-8' }).trim();
  } catch {
    try {
      diffOutput = execSync(`git diff --name-status ${baseRef}...HEAD`, { encoding: 'utf-8' }).trim();
    } catch (err) {
      console.warn(`[警告] PR差分を取得できませんでした (${err.message})`);
      return;
    }
  }

  if (!diffOutput) {
    fail('PR', '変更されたファイルが見つかりません。');
    return;
  }

  const lines = diffOutput.split('\n').filter(Boolean);
  const changedJsonFiles = [];
  const changedImageFiles = [];

  for (const line of lines) {
    const parts = line.split('\t');
    const status = parts[0];
    const filePath = parts[parts.length - 1];

    // 1. check for file deletions
    if (status.startsWith('D')) {
      fail(filePath, 'ファイルの削除は許可されていません。他の参加者や共通のファイルを削除していないか確認してください。');
      continue;
    }

    // 2. check if the file is in allowed paths
    const isContentsJson = /^contents\/[a-z0-9_-]+\.json$/.test(filePath);
    const isPublicImage = /^public\/images\/[a-z0-9_-]+\.(png|jpg|jpeg)$/.test(filePath);

    if (isContentsJson) {
      changedJsonFiles.push(filePath);
    } else if (isPublicImage) {
      changedImageFiles.push(filePath);
    } else {
      fail(
        filePath,
        '共通ファイルまたは許可されていないファイルの変更が含まれています。\n' +
        '   PRで変更できるのは「contents/<あなたのID>.json」および「public/images/<あなたのID>.(png|jpg)」のみです。'
      );
    }
  }

  // 3. Limit number of changed files
  if (changedJsonFiles.length > 1) {
    fail(
      'PR',
      `1つのPRで変更できるJSONファイルは1件のみです（現在 ${changedJsonFiles.length} 件変更されています: ${changedJsonFiles.join(', ')}）。`
    );
  }

  if (changedImageFiles.length > 1) {
    fail(
      'PR',
      `1つのPRで追加・変更できる画像ファイルは1件のみです（現在 ${changedImageFiles.length} 件変更されています: ${changedImageFiles.join(', ')}）。`
    );
  }

  // 4. if both JSON and image are changed, check if IDs match
  if (changedJsonFiles.length === 1 && changedImageFiles.length === 1) {
    const jsonId = path.basename(changedJsonFiles[0], '.json');
    const imageId = path.basename(changedImageFiles[0]).replace(/\.(png|jpg|jpeg)$/, '');
    if (jsonId !== imageId) {
      fail(
        'PR',
        `JSONのID（${jsonId}.json）と画像ファイル名（${path.basename(changedImageFiles[0])}）のIDが一致していません。同じ名前にしてください（例: ${jsonId}.png）。`
      );
    }
  }

  if (!hasError) {
    console.log('OK: [PR] 差分ファイルチェックをパスしました。');
  }
  console.log('----------------------------------------\n');
}

// run PR diff validation if running in PR environment or --diff flag is passed
validatePRDiff();

// validate JSON files in contents/
const files = fs.readdirSync(CONTENTS_DIR).filter(f => f.endsWith('.json') && fs.statSync(path.join(CONTENTS_DIR, f)).isFile());

if (files.length === 0) {
  fail('contents/', 'JSONファイルが1つも見つかりません。');
}

for (const file of files) {
  let fileHasError = false;
  const fileFail = (msg) => {
    fail(file, msg);
    fileHasError = true;
  };

  // check file name
  if (!/^[a-z0-9_-]+\.json$/.test(file)) {
    fileFail('ファイル名は「半角英小文字・数字・ハイフン・アンダースコア」のみにしてください（例: k3ijay.json）');
  }

  const filePath = path.join(CONTENTS_DIR, file);
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    fileFail(`ファイルの読み出しに失敗しました: ${err.message}`);
    continue;
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    fileFail(`JSONの構文にエラーがあります。カンマ（,）の抜けや余分なカンマ、ダブルクォーテーション（"）の閉じ忘れを確認してください。\n   詳細: ${err.message}`);
    continue;
  }

  // check if data is a plain object
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    fileFail('JSONのトップレベルはオブジェクト（{ ... }）である必要があります。');
    continue;
  }

  // check required keys
  const requiredKeys = ['name', 'comment', 'github'];
  for (const key of requiredKeys) {
    if (typeof data[key] !== 'string' || data[key].trim() === '') {
      fileFail(`必須項目 "${key}" が入力されていないか、文字列ではありません。`);
    }
  }

  // check github username format
  if (typeof data.github === 'string' && data.github.trim() !== '') {
    const gh = data.github.trim();
    if (gh.startsWith('@')) {
      fileFail(`"github" に "@" は含めないでください。ID（ユーザー名）のみを指定してください（現在の値: "${data.github}"）`);
    } else if (gh.includes('github.com') || gh.includes('/')) {
      fileFail(`"github" に URL は含めないでください。ID（ユーザー名）のみを指定してください（現在の値: "${data.github}"）`);
    } else if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/.test(gh)) {
      fileFail(`"github" には有効な GitHub ユーザー名（半角英数字およびハイフン、最大39文字）を指定してください（現在の値: "${data.github}"）`);
    }
  }

  // avatar check
  if (data.avatar !== undefined && data.avatar !== null) {
    if (typeof data.avatar !== 'string') {
      fileFail('"avatar" は文字列で指定してください。');
    } else if (data.avatar !== '/images/default-avatar.png') {
      if (!/^\/images\/[a-z0-9_-]+\.(png|jpg|jpeg)$/.test(data.avatar)) {
        fileFail(`"avatar" のパスは "/images/英小文字名.png"（または .jpg）の形式で指定してください（現在の値: "${data.avatar}"）`);
      } else {
        const imgFullPath = path.join(PUBLIC_DIR, data.avatar);
        if (!fs.existsSync(imgFullPath)) {
          fileFail(`指定された画像ファイル "public${data.avatar}" が見つかりませんでした。画像の変更をステージングやコミットを忘れていないか確認してください。`);
        } else {
          const stat = fs.statSync(imgFullPath);
          if (stat.size > MAX_IMAGE_BYTES) {
            const kb = Math.round(stat.size / 1024);
            fileFail(`画像の容量が上限（2MB）を超えています（現在: ${kb}KB）。画像を縮小または圧縮する必要があります。`);
          }

          let dim;
          try {
            const imgBuf = fs.readFileSync(imgFullPath);
            dim = imageSize(imgBuf);
          } catch {
            dim = null;
          }

          if (!dim || !dim.width || !dim.height) {
            fileFail(`画像ファイル（${data.avatar}）の形式を正しく読み込めませんでした。PNGまたはJPEG画像を使用しているか再度確認してください。`);
          } else {
            // check whether the image is square or not, allowing a tolerance of a few pixels
            const diff = Math.abs(dim.width - dim.height);
            if (diff > 2) {
              fileFail(`画像が正方形ではありません（現在のサイズ: 横${dim.width}px × 縦${dim.height}px）。1:1の正方形の画像を設定してください。`);
            }
          }
        }
      }
    }
  }

  if (!fileHasError) {
    pass(file, 'フォーマット確認をパスしました。');
  }
}

if (hasError) {
  console.error('\nエラーが見つかりました。上記のメッセージを確認して修正し、もう一度コミットとプッシュをしてください。');
  process.exit(1);
} else {
  console.log('\nすべてのチェックが問題なく完了しました。');
}
