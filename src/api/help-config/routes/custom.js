'use strict';

module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/help-configs/by-route',
      handler: 'help-config.findByRoute',
      config: {
        auth: false,
      },
    },
  ],
};
