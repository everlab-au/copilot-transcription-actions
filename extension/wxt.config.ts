import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "AI Meeting Assistant",
    // Add necessary permissions for audio capture and tab recording
    permissions: [
      "sidePanel",
      "tabCapture",
      "audioCapture",
      "storage",
      "tabs",
      "offscreen",
      "activeTab",
    ],

    // Configure the side_panel
    side_panel: {
      default_path: "sidepanel/index.html",
    },

    // Configure action without default_popup
    action: {
      default_title: "Open AI Meeting Assistant",
    },

    // Add web accessible resources for permission request files and test page
    web_accessible_resources: [
      {
        resources: ["requestPermissions/index.html", "permissionTest.html"],
        matches: ["<all_urls>"],
      },
    ],

    // Specify host permissions to ensure microphone access works
    host_permissions: ["<all_urls>"],

    // Content security policy to allow iframe communication
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'; frame-src 'self'",
    },
  },
});
