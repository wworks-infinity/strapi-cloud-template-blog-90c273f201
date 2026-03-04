'use strict';

/**
 * help-config router.
 */

const { createCoreRouter } = require('@strapi/strapi').factories;

module.exports = createCoreRouter('api::help-config.help-config', {
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
});
