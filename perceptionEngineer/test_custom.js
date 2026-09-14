/**
 * test_custom.js
 * CLI helper script to test your own custom screenshot images and DOM JSON files with analyzeScreen()
 *
 * Usage:
 *   node test_custom.js <image_path> [dom_json_path]
 *
 * Example:
 *   node test_custom.js ./my_screen.png ./my_dom.json
 */

const fs = require('fs');
const path = require('path');
const { PerceptionEngine } = require('./perception/perception.js');
const { PERCEPTION_SAMPLE_DATA } = require('./perception/sample_data.js');

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
Usage:
  node test_custom.js <image_path> [dom_json_path]

Example:
  node test_custom.js ./sample.jpg ./sample_dom.json
`);
    console.log("No custom image path passed. Running default test sample...\n");
  }

  const imagePath = args[0];
  const domPath = args[1];

  let screenshotBase64 = null;
  let domTree = null;

  if (imagePath) {
    if (!fs.existsSync(imagePath)) {
      console.error(`❌ Error: Image file not found at path: ${imagePath}`);
      process.exit(1);
    }

    const imageBuffer = fs.readFileSync(imagePath);
    const ext = path.extname(imagePath).replace('.', '') || 'jpeg';
    screenshotBase64 = `data:image/${ext};base64,${imageBuffer.toString('base64')}`;
    console.log(`📸 Loaded Custom Screenshot Image: ${imagePath} (${(imageBuffer.length / 1024).toFixed(1)} KB)`);
  } else {
    screenshotBase64 = PERCEPTION_SAMPLE_DATA.loginForm.screenshotBase64;
    console.log("📸 Using Default Login Form Screenshot Sample");
  }

  if (domPath) {
    if (!fs.existsSync(domPath)) {
      console.error(`❌ Error: DOM file not found at path: ${domPath}`);
      process.exit(1);
    }

    const domFileContent = fs.readFileSync(domPath, 'utf8').trim();
    if (domFileContent.startsWith('<') || domPath.endsWith('.html')) {
      domTree = domFileContent;
      console.log(`📄 Loaded Custom Raw HTML File: ${domPath}`);
    } else {
      try {
        domTree = JSON.parse(domFileContent);
        console.log(`📄 Loaded Custom DOM Tree JSON File: ${domPath}`);
      } catch (e) {
        domTree = domFileContent; // Fallback to raw string
        console.log(`📄 Loaded Custom DOM Text String: ${domPath}`);
      }
    }
  } else {
    domTree = PERCEPTION_SAMPLE_DATA.loginForm.domTree;
    console.log("📄 Using Default DOM Tree Sample");
  }

  console.log("\n🚀 Initializing Perception Engine...");
  const engine = new PerceptionEngine({ backend: 'dom' });
  await engine.initialize();

  const startTime = performance.now();
  const result = await engine.analyze(screenshotBase64, domTree);
  const endTime = performance.now();

  console.log("\n=======================================================");
  console.log(`✅ EXECUTED analyzeScreen() IN ${Math.round(endTime - startTime)} ms`);
  console.log("=======================================================\n");

  console.log("CONTRACT OUTPUT JSON:");
  console.log(JSON.stringify(result, null, 2));
}

main().catch(err => {
  console.error("Fatal Error:", err);
  process.exit(1);
});
