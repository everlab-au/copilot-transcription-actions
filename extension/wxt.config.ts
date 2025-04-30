import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "AI Meeting Assistant",
    // Add necessary permissions for audio capture and tab recording
    permissions: ["sidePanel", "tabCapture", "audioCapture", "storage", "tabs"],

    // Configure the side_panel
    side_panel: {
      default_path: "sidepanel/index.html",
    },

    // Configure action without default_popup
    action: {
      default_title: "Open AI Meeting Assistant",
    },
  },
});
