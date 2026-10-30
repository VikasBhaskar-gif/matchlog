import https from "https";
import fs from "fs";

function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" } }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(data));
      res.on("error", reject);
    });
  });
}

async function run() {
  // 1. LaLiga 2023 Official SVG
  console.log("Fetching LaLiga...");
  const laligaSvg = await download("https://upload.wikimedia.org/wikipedia/commons/5/54/LaLiga_EA_Sports_2023_Vertical_Logo.svg");
  fs.writeFileSync("frontend/public/logos/laliga.svg", laligaSvg);
  console.log("LaLiga saved, bytes:", laligaSvg.length);

  // 2. UEFA Champions League Starball Official SVG
  console.log("Fetching UCL Starball...");
  const uclSvg = await download("https://upload.wikimedia.org/wikipedia/en/f/f5/UEFA_Champions_League.svg");
  // Ensure the starball paths fill with white/silver or visible color so it looks incredible on dark backgrounds
  // In the original, the path has fill="#00004b" or no fill (black).
  // Let's replace fill with #ffffff for crisp white stars, or make it a starball with white stars and dark blue outline:
  fs.writeFileSync("frontend/public/logos/ucl.svg", uclSvg);
  console.log("UCL Starball saved, bytes:", uclSvg.length);
}

run().catch(console.error);
