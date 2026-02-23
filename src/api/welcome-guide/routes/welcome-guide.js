'use strict';

/**
 * welcome-guide router.
 */

const { createCoreRouter } = require('@strapi/strapi').factories;

module.exports = createCoreRouter('api::welcome-guide.welcome-guide', {
  routes: [
    {
      method: 'GET',
      path: '/welcome-guides/by-slug/:slug',
      handler: 'welcome-guide.findBySlug',
      config: {
        auth: false,
      },
    },
  ],
});
