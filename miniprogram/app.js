const config = require('./config');
App({
  onLaunch() {
    if (config.mode === 'cloud' && wx.cloud) wx.cloud.init({ env: config.cloudEnv, traceUser: false });
  }
});
