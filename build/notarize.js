const { notarize } = require('@electron/notarize');
require('dotenv').config();
exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') {
    return;
  }

  const appName = context.packager.appInfo.productFilename;

  return await notarize({
    tool: 'notarytool',
    appPath: `${appOutDir}/${appName}.app`,
    appBundleId: process.env.BUNDLE_ID,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
    ascProvider: process.env.APPLE_TEAM_ID,
    teamId: process.env.APPLE_TEAM_ID
  });
}; 