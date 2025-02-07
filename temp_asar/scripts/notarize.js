const { notarize } = require('@electron/notarize');
const { build } = require('../package.json');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') {
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;

  console.log(`Notarizing ${appPath}...`);

  try {
    await notarize({
      appPath,
      appBundleId: build.appId,
      tool: 'notarytool',
      teamId: process.env.APPLE_TEAM_ID
    });
  } catch (error) {
    console.error('Notarization failed:', error);
  }
}; 