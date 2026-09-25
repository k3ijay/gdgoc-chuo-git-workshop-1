import fs from 'node:fs';
import path from 'node:path';

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

// simple png/jpeg parser for extracting image size
function getImageDimensions(buffer) {
  // png: check the 8-byte PNG signature and extracts dimensions from the IHDR chunk
  if (buffer.length >= 24 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    return { width, height, type: 'png' };
  }
  // jpeg
  if (buffer.length > 4 && buffer[0] === 0xFF && buffer[1] === 0xD8) {
    let offset = 2;
    while (offset < buffer.length) {
      if (buffer[offset] !== 0xFF) break;
      const marker = buffer[offset + 1];
      if (
        (marker >= 0xC0 && marker <= 0xC3) ||
        (marker >= 0xC5 && marker <= 0xC7) ||
        (marker >= 0xC9 && marker <= 0xCB) ||
        (marker >= 0xCD && marker <= 0xCF)
      ) {
        const height = buffer.readUInt16BE(offset + 5);
        const width = buffer.readUInt16BE(offset + 7);
        return { width, height, type: 'jpg' };
      }
      const segmentLength = buffer.readUInt16BE(offset + 2);
      offset += 2 + segmentLength;
    }
  }
  return null;
}

const files = fs.readdirSync(CONTENTS_DIR).filter(f => f.endsWith('.json'));

if (files.length === 0) {
  fail('contents/', 'JSONファイルが1つも見つかりません。');
}

for (const file of files) {
  // check file name
  if (!/^[a-z0-9_-]+\.json$/.test(file)) {
    fail(file, 'ファイル名は「半角英小文字・数字・ハイフン」のみにしてください（例: k3ijay.json）');
  }

  const filePath = path.join(CONTENTS_DIR, file);
  const raw = fs.readFileSync(filePath, 'utf-8');

  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    fail(file, `JSONの構文にエラーがあります。カンマ（,）の抜けや余分なカンマ、ダブルクォーテーション（"）の閉じ忘れを確認してください。\n   詳細: ${err.message}`);
    continue;
  }

  // check required keys
  const requiredKeys = ['name', 'comment', 'github'];
  for (const key of requiredKeys) {
    if (typeof data[key] !== 'string' || data[key].trim() === '') {
      fail(file, `必須項目 "${key}" が入力されていないか、文字列ではありません。`);
    }
  }

  // avatar check
  if (data.avatar && data.avatar !== '/images/default-avatar.svg') {
    if (!/^\/images\/[a-z0-9_-]+\.(png|jpg|jpeg)$/.test(data.avatar)) {
      fail(file, `"avatar" のパスは "/images/英小文字名.png"（または .jpg）の形式で指定してください（現在の値: "${data.avatar}"）`);
    } else {
      const imgFullPath = path.join(PUBLIC_DIR, data.avatar);
      if (!fs.existsSync(imgFullPath)) {
        fail(file, `指定された画像ファイル "public${data.avatar}" が見つかりませんでした。画像の変更ステージングし忘れていないか確認してください。`);
      } else {
        const stat = fs.statSync(imgFullPath);
        if (stat.size > MAX_IMAGE_BYTES) {
          const kb = Math.round(stat.size / 1024);
          fail(file, `画像の容量が上限（2MB）を超えています（現在: ${kb}KB）。画像を縮小または圧縮する必要があります。`);
        }

        const imgBuf = fs.readFileSync(imgFullPath);
        const dim = getImageDimensions(imgBuf);
        if (!dim) {
          fail(file, `画像ファイル（${data.avatar}）の形式を正しく読み込めませんでした。PNGまたはJPEG画像を使用しているか再度確認してください。`);
        } else {
          // check whether the image is square or not, allowing a tolerance of a few pixels
          const diff = Math.abs(dim.width - dim.height);
          if (diff > 2) {
            fail(file, `画像が正方形ではありません（現在のサイズ: 横${dim.width}px × 縦${dim.height}px）。1:1の正方形の画像を設定してください。`);
          }
        }
      }
    }
  }

  if (!hasError) {
    pass(file, 'フォーマット確認をパスしました。');
  }
}

if (hasError) {
  console.error('\nエラーが見つかりました。上記のメッセージを確認して修正し、もう一度コミットとプッシュをしてください。');
  process.exit(1);
} else {
  console.log('\nすべてのチェックが問題なく完了しました。');
}
