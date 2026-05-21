const fs = require('fs');
const path = require('path');

const manifestPath = path.join(__dirname, 'android/app/src/main/AndroidManifest.xml');
let content = fs.readFileSync(manifestPath, 'utf8');

// Try multiple patterns to find and replace
if (content.includes('xmlns:android="http://schemas.android.com/apk/res/android">')) {
  content = content.replace(
    'xmlns:android="http://schemas.android.com/apk/res/android">',
    'xmlns:android="http://schemas.android.com/apk/res/android"\n    package="com.videoplayer">'
  );
} else if (content.includes('<manifest') && !content.includes('package=')) {
  content = content.replace(
    '<manifest xmlns:android',
    '<manifest xmlns:android="http://schemas.android.com/apk/res/android"\n    package="com.videoplayer"\n    xmlns:android'
  );
  content = content.replace(
    '    xmlns:android="http://schemas.android.com/apk/res/android"',
    ''
  );
}

fs.writeFileSync(manifestPath, content, 'utf8');
console.log('AndroidManifest.xml fixed!');
console.log('First 200 chars:', content.substring(0, 200));
