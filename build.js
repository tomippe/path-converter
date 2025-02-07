require("electron-builder").build({
    config: {
        "appId": "jp.tomippe.pathconverter",
        "productName": "Path Converter",
        "asar": false,
        "files": [
          "src",
          "package.json"
        ],
        "directories": {
          "buildResources": "build",
          "output": "dist"
        },
        "afterSign": "build/notarize.js",
        "mac": {
          "category": "public.app-category.utilities",
          "hardenedRuntime": true,
          "gatekeeperAssess": false,
          "entitlements": "build/entitlements.mac.plist",
          "entitlementsInherit": "build/entitlements.mac.plist",
          "icon": "build/icon.icns",
          "target": [
            "zip"
          ],
          "identity": "TOMIHIDE OTA",
          "provisioningProfile": null,
          "strictVerify": false,
          "extendInfo": {
            "CFBundleDocumentTypes": [
              {
                "CFBundleTypeName": "All Files",
                "CFBundleTypeRole": "Viewer",
                "LSHandlerRank": "Alternate",
                "LSItemContentTypes": [
                  "public.item",
                  "public.folder"
                ],
                "LSIsAppleDefaultForType": true
              }
            ],
            "CFBundleURLTypes": [
              {
                "CFBundleURLName": "File",
                "CFBundleURLSchemes": [
                  "file"
                ]
              }
            ]
          }
        }
      }
});