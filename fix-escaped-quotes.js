const fs = require('fs');
const path = require('path');

const filesToFix = [
  'android/build.gradle',
  'android/app/build.gradle',
  'android/gradle.properties',
  'android/app/src/main/AndroidManifest.xml',
  'android/app/src/main/java/com/videoplayer/MainActivity.java',
  'android/app/src/main/java/com/videoplayer/MainApplication.java',
  'android/app/src/main/res/values/strings.xml',
  'android/app/src/main/res/values/styles.xml',
  'src/App.tsx',
  'src/screens/HomeScreen.tsx',
  'src/components/VideoPlayer.tsx',
  'src/components/Playlist.tsx',
  'src/types/video.ts',
  'src/utils/videoUtils.ts',
  'babel.config.js',
  'metro.config.js',
  'tsconfig.json',
  'index.js',
];

let fixedCount = 0;
for (const relPath of filesToFix) {
  const fullPath = path.join(__dirname, relPath);
  if (!fs.existsSync(fullPath)) continue;

  let content = fs.readFileSync(fullPath, 'utf8');
  let changed = false;

  // Replace escaped quotes with real quotes (but not in JSON-like contexts where it should stay)
  if (content.includes('\\"')) {
    content = content.replace(/\\"/g, '"');
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`FIXED: ${relPath}`);
    fixedCount++;
  }
}
console.log(`\nFixed ${fixedCount} files.`);
