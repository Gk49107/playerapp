const fs = require('fs');
const path = require('path');
// Files to fix
const filesToFix = [
  'android/build.gradle',
  'android/app/build.gradle',
  'android/gradle.properties',
  'android/gradle/wrapper/gradle-wrapper.properties',
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

let fixed = 0;
for (const relPath of filesToFix) {
  const fullPath = path.join(__dirname, relPath);
  if (!fs.existsSync(fullPath)) {
    console.log(`SKIP (not found): ${relPath}`);
    continue;
  }
  const content = fs.readFileSync(fullPath, 'utf8');
  if (content.includes('\\n') || content.includes('\\t')) {
    // Check if it's a single-line file that needs \n expansion
    const lines = content.split('\n');
    if (lines.length <= 3 && content.includes('\\n')) {
      const fixed_content = content
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\r/g, '\r');
      fs.writeFileSync(fullPath, fixed_content, 'utf8');
      console.log(`FIXED: ${relPath}`);
      fixed++;
    }
  }
}
console.log(`\nFixed ${fixed} files.`);
