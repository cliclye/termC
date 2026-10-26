// No Apple Developer certificate is used, so give the bundle an ad-hoc signature.
// Apple Silicon refuses to launch apps whose signature was invalidated by packaging.
const { execFileSync } = require('node:child_process');
const path = require('node:path');

exports.default = async (context) => {
  if (context.electronPlatformName !== 'darwin') return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
};
