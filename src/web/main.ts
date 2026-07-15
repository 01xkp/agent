import "element-plus/theme-chalk/base.css";
import "element-plus/theme-chalk/el-button.css";
import "element-plus/theme-chalk/el-input.css";
import "element-plus/theme-chalk/el-message.css";
import "element-plus/theme-chalk/el-scrollbar.css";
import "element-plus/theme-chalk/el-tab-pane.css";
import "element-plus/theme-chalk/el-tabs.css";
import "element-plus/theme-chalk/el-tag.css";
import "element-plus/theme-chalk/el-tooltip.css";
import {
  ElButton,
  ElInput,
  ElScrollbar,
  ElTabPane,
  ElTabs,
  ElTag,
  ElTooltip,
} from "element-plus";
import { createApp } from "vue";
import App from "./App.vue";
import "./styles.css";

createApp(App)
  .component("ElButton", ElButton)
  .component("ElInput", ElInput)
  .component("ElScrollbar", ElScrollbar)
  .component("ElTabPane", ElTabPane)
  .component("ElTabs", ElTabs)
  .component("ElTag", ElTag)
  .component("ElTooltip", ElTooltip)
  .mount("#app");
