import sharp from "sharp";
import { fileURLToPath } from "node:url";

const svg = `
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="#ffffff"/>
  <rect x="72" y="72" width="1056" height="10" fill="#2f6fed"/>
  <g font-family="Noto Sans KR, Malgun Gothic, sans-serif">
    <text x="72" y="158" fill="#5f5f5a" font-size="30" font-weight="700">음악 아카이브</text>
    <text x="72" y="445" fill="#171717" font-size="76" font-weight="700" letter-spacing="-4">근거가 있는 오늘의 음악</text>
    <text x="72" y="518" fill="#5f5f5a" font-size="32">실제 앨범, 개인 기록, 그래프 연결을 한곳에서 봅니다.</text>
  </g>
</svg>`;

const outputPath = fileURLToPath(new URL("../app/opengraph-image.png", import.meta.url));
await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(outputPath);
